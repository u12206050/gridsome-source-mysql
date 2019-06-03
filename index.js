const mysql = require('mysql')
const file = require('./file.js')

const ISDEV = process.env.NODE_ENV === 'development'

class MySQLSource {
  static defaultOptions () {
    return {
      debug: false,
      ignoreImages: false,
      imageDirectory: 'sql_images',
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

    this.pool = mysql.createPool({
      ...options.connection
    });

    this.cTypes = {}
    this.queries = options.queries || []
    if (!this.queries.length) throw new Error('No queries to load')

    this.loadImages = false
    this.images = options.ignoreImages ? false : {}
    this.imageDirectory = options.imageDirectory

    api.loadSource(async (store) => {
      this.store = store
      await this.fetchQueries(this.queries)
      if (this.images && this.loadImages) await this.downloadImages()

      this.pool.end(function(err) {
        ISDEV && console.log('MySQL Connections Closed')
      });
    })
  }

  async fetchQueries(queries, parentQuery, parentRow) {
    const { slugify, addContentType, makeUid, createReference } = this.store

    await Promise.all(queries.map(async (Q) => {
      const args = (typeof Q.args === 'function' ? Q.args(parentRow) : Q.args) || null
      const sql = mysql.format(Q.sql, args)
      const cType = this.cTypes[Q.name] = addContentType({
        typeName: Q.name
      })

      const rels = []

      const rows = await new Promise((resolve, reject) => {
        this.pool.query(sql, (error, results, fields) => {
          if (error) throw new Error(error)

          /* Find relationship fields */
          console.log(typeof fields)
          for (const f in fields) {
            const field = fields[f].name
            const matches = field.match(/^(.+)_id$/)
            console.log(matches)
            if (matches && matches.length === 1) {
              rels.push({
                name: matches[0],
                field
              })
            }
          }

          resolve(results)
        })
      })

      if (!Array.isArray(rows)) rows = []

      ISDEV && console.log(`${Q.name}: retrieved ${rows.length} results`)

      if (typeof Q.path !== 'function') {
        /* Default path function */
        Q.path = (slugify, row, parent) => {
          let slug = `/${Q.name}/${row.id}`
          if (typeof Q.path === 'object') {
            slug = Q.path.prefix || ''
            slug += `/${slugify(row[Q.path.field]) || row.id}`
            slug += Q.path.suffix || ''
          } else if (Q.path === 'string') {
            slug = slugify(row[Q.path]) || slug
          }
          return slug
        }
      }

      return Promise.all(rows.map(row => {
        if (!row.id) throw new Error('Rows must have id field')

        row.path = Q.path(slugify, row, parentRow)

        if (parentQuery && parentRow)
          row._parent = createReference(parentQuery.name, parentRow.id)

        /* Check for images */
        if (this.images && Array.isArray(Q.images)) {
          Q.images.forEach(imgField => {
            const url = row[imgField]
            row[imgField] = null

            if (url.match(/^https:\/\/.*\/.*\.(jpg|png|svg|gif|jpeg)($|\?)/i)) {
              const filename = file.getFilename(url)
              const id = makeUid(url)
              const filepath = file.getFullPath(this.imageDirectory, filename)
              if (!this.images[id]) this.images[id] = {
                filename,
                url,
                filepath
              }

              this.loadImages = true

              row[imgField] = filepath
            }
          })
        }

        /* Check for relationships */
        rels.forEach(rel => {
          row[rel.field] = createReference(rel.name, row[rel.field])
        })

        cType.addNode(row)

        /* Check sub queries to execute with parent */
        if (Array.isArray(Q.subs)) return this.fetchQueries(Q.subs, Q, row)

        return row
      }))
    }))
  }

  async downloadImages() {
    file.createDirectory(this.imageDirectory)

    await Object.keys(this.images).map(async (id) => {
      const { filename, url, filepath } = this.images[id]

      if (!file.exists(filepath)) {
        await file.download(url, filepath)
        ISDEV && console.log(`Downloaded ${filename}`)
      } else ISDEV && console.log(`${filename} already exists`)
    })

    this.loadImages = false
  }
}

module.exports = MySQLSource