const os = require('os')
const readline = require('readline')
const mysql = require('mysql')
const pMap = require('p-map')
const file = require('./file.js')

const probe = require('probe-image-size')
const imageDataURI = require('image-data-uri')

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
      cloudinary: {
        name: 'dprtlkeil',
        folder: 'media',
        uri: 'c_scale,e_vectorize,w_50',
        sizes: ['1920', '1024', '480'],
        match: /https?:\/\/www\.tilboligen\.no\/media\//
      },
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
    this.images = opts.ignoreImages ? false : {}
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

    api.loadSource(async (store) => {
      this.store = store

      this.checkQNames(this.queries)

      await this.fetchQueries(this.queries)
      this.pool.end(function(err) {
        ISDEV && console.log('MySQL Connections Closed')
      })

      if (this.images && this.loadImages) await this.downloadImages()
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

        /* Check for images */
        if (this.images && Array.isArray(Q.images)) {
          await pMap(Q.images, async imgField => {
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
          }, {
            concurrency: cpus
          })
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
      const id = store.makeUid(filename)
      const filepath = file.getFullPath(imageDirectory, filename)

      if (!images[id]) {
        if (cloud) {
          if (!cloud.isMatch(url)) return null
          try {
            console.log(filename)
            const path = cloud.getPath(url)
            const imageUri = await imageDataURI.encodeFromURL(cloud.toUrl(path, cloud.uri))
            const meta = await probe(cloud.toUrl(path))

            const srcset = []
            cloud.sizes.forEach(size => {
              if (size < meta.width) {
                let url = cloud.toUrl(path, `c_limit,q_auto:best,w_${size}`)
                srcset.push(`${url} ${size}w`)
              }
            })

            const src = cloud.toUrl(path, `c_limit,q_auto:best,w_${meta.width}`)
            srcset.push(`${url} ${meta.width}w`)

            images[id] = {
              src,
              srcset,
              dataUri: `data:image/svg+xml,<svg fill='none' viewBox='0 0 800 800' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'><defs><filter id='__svg-blur'><feGaussianBlur in='SourceGraphic' stdDeviation='30'/></filter></defs><image x='0' y='0' filter='url(%23__svg-blur)' width='800' height='800' xlink:href='${imageUri}' /></svg>`,
              size: {
                width: meta.width,
                height: meta.height
              }
            }
          } catch(err) {
            console.warn(err)
            return null
          }
        } else {
          images[id] = {
            filename,
            url,
            filepath
          }
          this.loadImages = true
        }
      }

      return images[id].filepath ? images[id].filepath : images[id]
    }
    return null
  }

  async downloadImages() {
    file.createDirectory(this.imageDirectory)

    let exists = 0
    const download = []
    Object.keys(this.images).forEach(async (id) => {
      const { src, filename, filepath } = this.images[id]
      if (src) return

      if (!file.exists(filepath)) {
        download.push(this.images[id])
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
}

module.exports = MySQLSource