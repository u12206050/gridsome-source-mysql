const os = require('os')
const readline = require('readline')
const mysql = require('mysql')
const pMap = require('p-map')
const file = require('./file.js')

const probe = require('probe-image-size')
const imageDataURI = require('image-data-uri')

const axios = require('axios')

let cpus = os.cpus().length
cpus = cpus > 2 ? cpus : 2

let ISDEV = process.env.NODE_ENV === 'development'

/* Capitalize string */
function capitalize(str) {
  str = str.trim()
  return str.trim().charAt(0).toUpperCase() + str.slice(1)
}

class MySQLSource {
  static defaultOptions () {
    return {
      debug: false,
      ignoreImages: false,
      imageDirectory: 'sql_images',
      regex: false,
      queries: [],
      jsonId: false,
      jsonChunkSize: 20,
      connection: {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'secret',
        database: 'my_db',
        connectionLimit : 10
      }
    }
  }

  constructor (api, options = MySQLSource.defaultOptions()) {

    const opts = {
      ...MySQLSource.defaultOptions(),
      ...options
    }

    this.pool = mysql.createPool({
      ...opts.connection
    });

    ISDEV = opts.debug

    this.cTypes = {}
    this.paths = {}
    this.queries = opts.queries || []
    if (!this.queries.length) throw new Error('No queries to load')

    this.loadImages = false
    this.regex = opts.regex
    this.images = false
    this.imageDirectory = opts.imageDirectory

    if (opts.cloudinary) {
      const { name, match, folder, uri, sizes } = opts.cloudinary
      this.cloud = {
        name, match, folder, uri, sizes,
        isMatch: (url) => {
          return url.match(match)
        },
        getPath: (url) => {
          return url.replace(match, '')
        },
        toUrl: (path, size) => {
          return `https://res.cloudinary.com/${name}/image/upload${size ? `/${size}/` : '/'}${folder}/${path}`
        }
      }
    }

    /* SETUP JSONBin Axios connection */
    const jsonbin = (() => {
      if (!opts.jsonbin || !opts.jsonbin.key) return false
      const options = {
        baseURL: 'https://api.jsonbin.io/b/',
        headers: {
          'secret-key': opts.jsonbin.key,
          'collection-id': opts.jsonbin.collectionId,
          versioning: false
        }
      }
      if (opts.jsonbin.collectionId) options['collection-id'] = opts.jsonbin.collectionId

      return axios.create(options)
    })()

    api.loadSource(async (store) => {
      this.store = store

      let rdata, q, existingBinIds = [];
      if (!opts.ignoreImages) {
        this.images = {}
        if (jsonbin) await this.loadImageCache(opts, jsonbin)
      }

      this.checkQNames(this.queries)

      await this.fetchQueries(this.queries)
      this.pool.end(function(err) {
        ISDEV && console.log('MySQL Connections Closed')
      })

      if (this.images) {
        if (this.loadImages) await this.downloadImages()
        if (jsonbin) await this.saveImageCache(opts, jsonbin)
      }
    })
  }

  checkQNames(queries) {
    Array.isArray(queries) && queries.forEach((Q) => {
      Q.name = capitalize(Q.name)
      if (this.cTypes[Q.name]) console.warn(`You should not have two queries with the same name. ${Q.name}`)
      else this.cTypes[Q.name] = true
      if (Q.subs) this.checkQNames(Q.subs)
    })
  }

  async fetchQueries(queries, parentQuery, parentRow) {
    const { slugify, addContentType, makeUid, createReference } = this.store

    await Promise.all(queries.map(async (Q) => {
      const args = (typeof Q.args === 'function' ? Q.args(parentRow) : Q.args) || null
      const sql = mysql.format(Q.sql, args)

      const cType = this.cTypes[Q.name] = addContentType({
        typeName: Q.name,
        route: Q.route
      })

      const rels = []

      const rows = await new Promise((resolve, reject) => {
        this.pool.query(sql, (error, results, fields) => {
          if (error) throw new Error(error)

          /* Find relationship fields */
          let hasIdField = false
          for (const f in fields) {
            const field = fields[f].name
            hasIdField = field === 'id' || hasIdField
            const matches = field.match(/^(.+)_(ids?$)/)
            if (matches && matches.length > 2) {
              const qname = matches[1]
              const qtype = capitalize(qname)
              if (this.cTypes[qtype]) {
                rels.push({
                  type: qtype,
                  name: qname,
                  field,
                  isArray: matches[2] === 'ids'
                })
              } else {
                console.warn(`No query with name "${qname}" exists. Not creating relation`)
              }
            }
          }

          if (!hasIdField) throw new Error('Rows must have id field')

          resolve(results)
        })
      })

      if (!Array.isArray(rows)) rows = []

      console.log(`${Q.name}: retrieved ${rows.length} results`)

      let PathFn = Q.path
      if (typeof PathFn !== 'function') {
        /* Default path function */
        PathFn = (slugify, row, parent) => {
          let slug = `/${Q.name}/${row.id}`
          if (typeof Q.path === 'object') {
            slug = Q.path.prefix || ''
            slug += `/${row[Q.path.field] ? slugify(row[Q.path.field]) : row.id}`
            slug += Q.path.suffix || ''
          } else if (typeof Q.path === 'string' && row[Q.path]) {
            slug = slugify(row[Q.path]) || slug
          }
          return slug
        }
      }

      return Promise.all(rows.map(async (row, i) => {
        row.mysqlId = row.id
        row.id = makeUid(`${Q.name}–${row.id}`)
        row.path = PathFn(slugify, row, parentRow)

        if (this.paths[row.path]) {
          row.path = `${row.path}-${this.paths[row.path]++}`
        } else this.paths[row.path] = 1

        if (parentQuery && parentRow)
          row._parent = createReference(parentQuery.name, parentRow.id)

        /* Parse JSON fields */
        if (Array.isArray(Q.json)) {
          Q.json.forEach(jsonField => {
            try {
              row[jsonField] = JSON.parse(row[jsonField])
            } catch (e) {
              row[jsonField] = null
            }
          })
        }

        /* Check for images */
        if (this.images && Array.isArray(Q.images)) {
          await pMap(Q.images, async imgField => {
            if (typeof imgField === 'function') {
              await imgField(row, (url) => this.addImage(url))
            }
            if (Array.isArray(imgField)) {
              if (imgField.length !== 1) throw new Error('MySQL query image array should contain exactly 1 field')
              const imageUrls = String(row[imgField[0]]).split(',')
              row[imgField[0]] = await Promise.all(imageUrls.map(async (url, i) => ({
                index: i,
                image: await this.addImage(url)
              })))
            } else {
              row[imgField] = await this.addImage(row[imgField])
            }
          }, { concurrency: 2 })
        }

        /* Check for relationships */
        rels.forEach(rel => {
          if (rel.isArray) {
            const ids = String(row[rel.field]).split(',')
            row[rel.name] = ids.map(id => createReference(rel.type,
              makeUid(`${rel.type}–${id}`)))
          } else {
            row[rel.name] = createReference(rel.type, makeUid(`${rel.type}–${row[rel.field]}`))
          }
        })

        cType.addNode(row)

        /* Check sub queries to execute with parent */
        if (Array.isArray(Q.subs)) return this.fetchQueries(Q.subs, Q, row)

        return row
      }))
    }))
  }

  async addImage(url) {
    if (url && String(url).match(/^https:\/\/.*\/.*\.jpg|png|svg|jpeg($|\?)/i)) {
      const { images, regex, store, imageDirectory, cloud } = this
      const filename = file.getFilename(url, regex)
      const iId = store.makeUid(filename)
      const filepath = file.getFullPath(imageDirectory, filename)

      if (!images[iId]) {
        if (cloud) {
          if (!cloud.isMatch(url)) return null
          const path = cloud.getPath(url)
          const src = cloud.toUrl(path, `f_auto`)

          let meta, imageUri = null
          try {
            meta = await probe(cloud.toUrl(path), { retries: 4 })
          } catch(err) {
            console.warn(`Failed loading meta for ${src}`)
            return null
          }
          try {
            imageUri = await imageDataURI.encodeFromURL(cloud.toUrl(path, cloud.uri), {
              timeout: 20000
            })
          } catch(err) {
            console.warn(`Failed loading image uri for ${src}`)
            return null
          }

          const srcset = []
          cloud.sizes.forEach(size => {
            if (size < meta.width) {
              srcset.push(`${cloud.toUrl(path, `f_auto,c_limit,q_auto:best,w_${size}`)} ${size}w`)
            }
          })

          srcset.push(`${src} ${meta.width}w`)

          images[iId] = {
            src,
            srcset,
            sizes: `(max-width: ${meta.width}w) 100vw, ${meta.width}w`,
            name: filename,
            dataUri: `data:image/svg+xml,<svg fill='none' viewBox='0 0 800 800' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'><defs><filter id='__svg-blur'><feGaussianBlur in='SourceGraphic' stdDeviation='30'/></filter></defs><image x='0' y='0' filter='url(%23__svg-blur)' width='800' height='800' xlink:href='${imageUri}' /></svg>`,
            size: {
              width: meta.width,
              height: meta.height
            }
          }
        } else {
          images[iId] = {
            filename,
            url,
            filepath
          }
          this.loadImages = true
        }
      }

      return images[iId].filepath ? images[iId].filepath : images[iId]
    }
    return null
  }

  async downloadImages() {
    const { images, imageDirectory } = this
    file.createDirectory(imageDirectory)

    let exists = 0
    const download = []
    Object.keys(images).forEach(async (iId) => {
      const { src, filename, filepath } = images[iId]
      if (src) return

      if (!file.exists(filepath)) {
        download.push(images[iId])
      } else exists++
    })

    const total = download.length
    let progress = 0
    function status(msg) {
      readline.clearLine(process.stdout, 0)
      readline.cursorTo(process.stdout, 0, null)
      process.stdout.write(msg)
    }

    console.log(`${exists} images already exists with ${total} images to download`)

    if (total) {
      await pMap(download, async ({ filename, url, filepath }) => {
        await file.download(url, filepath)
        status(`${Math.round((++progress)*100/total)}% – Downloaded ${filename}`)
      }, {
        concurrency: cpus * 2
      })

      status('100% – ')
      console.log(`${total} images downloaded`)
    }

    this.loadImages = false
  }

  async loadImageCache(opts, jsonbin) {
    const { images } = this

    try {
      const binInfo = await jsonbin.get(opts.jsonbin.binId).then(res => res.data)
      if (binInfo && binInfo.count && binInfo.binIds) {
        this.existingBinIds = binInfo.binIds
        console.log(`Loading ${this.existingBinIds.length} chunks containg ${binInfo.count} images`)

        let loaded = 0
        await pMap(this.existingBinIds, async (bId, i) => {
          const binImages = await jsonbin.get(bId).then(res => res.data)
          Object.keys(binImages).forEach(iId => {
            if (typeof binImages[iId] === 'object') {
              images[iId] = binImages[iId]
              loaded++
            }
          })
        }, { concurrency: 4 })

        try {
          this.checksum = JSON.stringify(images).length
        } catch(err) {
          console.log('Failed creating checksum')
        }

        console.log(`Loaded ${loaded} images from jsonbin`)
      } else {
        console.log(`No images from jsonbin or invalid bin id`)
      }
    } catch(err) {
      this.images = {}
      console.log('Error loading from jsonbin')
      console.log(err.message)
    }
  }

  async saveImageCache(opts, jsonbin) {
    const { images, checksum, existingBinIds } = this
    try {
      if (checksum > 10 && checksum === JSON.stringify(images).length) {
        console.log('Checksum passed, no need to update image cache')
        return
      }
    } catch(err) {
      console.log('Failed checking checksum')
    }

    try {
      const iIds = Object.keys(images)
      const count = iIds.length

      const chunks = []
      let chunk = {}
      const chunkSize = 60
      let size = chunkSize

      iIds.forEach(iId => {
        if (size--) {
          chunk[iId] = this.images[iId]
        } else {
          chunks.push(chunk)
          size = chunkSize
          chunk = {}
        }
      })

      console.log(`Chunking and saving ${count} images`)

      if (size !== chunkSize) {
        chunks.push(chunk)
      }

      const usedBinIds = []
      await pMap(chunks, async (chunk, cI) => {
        let bId = existingBinIds.pop()
        if (bId) {
          return jsonbin.put(bId, chunk).then(res => {
            usedBinIds.push(bId)
            console.log(`${cI} Updated bin`)
            return cI
          }).catch((err) => {
            console.log(`${cI} failed: ${err.message}`)
          })
        } else {
          return jsonbin.post('', chunk).then(res => {
            usedBinIds.push(res.data.id)
            console.log(`${cI} Created new bin`)
            return jsonbin.put(opts.jsonbin.binId, {
              binIds: usedBinIds,
              count
            })
          }).catch((err) => {
            console.log(`${cI} failed: ${err.message}`)
          })
        }
      }, { concurrency: 4 })

      await jsonbin.put(opts.jsonbin.binId, {
        binIds: usedBinIds,
        count
      })

      /* Cleanup */
      await Promise.all(existingBinIds.map((bId) => jsonbin.delete(bId).then((res) => {
        console.log(`Deleted ${bId}`)
        return res.data
      }))).catch(() => {
        console.log("Don't panic :) FYI, I tried to delete unused bins but failed. But otherwise I have ")
      })

      console.log(`Saved ${count} images thumbnails to jsonbin`)

    } catch(error) {
      console.log('Error saving to jsonbin')
      console.log(error.message)
    }
  }
}

module.exports = MySQLSource