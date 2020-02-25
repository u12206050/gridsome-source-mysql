const os = require('os')
const readline = require('readline')
const mysql = require('mysql')
const pMap = require('p-map')
const file = require('./file.js')

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
              row[imgField[0]] = String(row[imgField[0]]).split(',').map((url, i) => ({
                index: i,
                image: this.addImage(url)
              })).filter(image => !!image)
            } else {
              row[imgField] = this.addImage(row[imgField])
            }

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

  addImage(url) {
    if (url && String(url).match(/^https:\/\/.*\/.*\.(jpg|png|svg|jpeg)($|\?)/i)) {
      const filename = file.getFilename(url, this.regex)
      const id = this.store.makeUid(filename)
      const filepath = file.getFullPath(this.imageDirectory, filename)
      if (!this.images[id]) this.images[id] = {
        filename,
        url,
        filepath
      }

      this.loadImages = true

      return filepath
    }
    return null
  }

  async downloadImages() {
    file.createDirectory(this.imageDirectory)

    let exists = 0
    const download = []
    Object.keys(this.images).forEach(async (id) => {
      const { filename, filepath } = this.images[id]

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