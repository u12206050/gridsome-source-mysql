** IN ACTIVE DEVELOPMENT **

# Gridsome source MySQL

Gridsome Source Plugin to load data directly from MySQL Database

  * If you don't succeed through a CMS, bypass it and load the data directly from the MySQL Database

  * Specify names of columns containing image urls to download and optimized them with Gridsome.

  * Build up your mysql queries as you need to get the data you require.

  * Supports sub queries


View the [changelog](https://github.com/u12206050/gridsome-source-mysql/blob/master/CHANGELOG.md) for any possible changes from previous versions.

## Install

  `npm install gridsome-source-mysql`

## Setup

> Make sure your mysql database is accessible everywhere you are planning to build your site from.

Within plugins in the `gridsome-config.js` file, add the connection settings and queries for the data you need.

```javascript:title=gridsome-config.js
// gridsome-config.js

module.exports = {
  plugins: [
    {
      use: 'gridsome-source-mysql',
      options: {
        connection: {
          host: 'localhost',
          port: 3306,
          user: 'root',
          password: 'secret',
          database: 'my_db',
          connectionLimit : 10
        },
        debug: true, // Default false
        ignoreImages: false,
        imageDirectory: 'sql_images',
        queries: [
          {
            name: 'author',
            path: {
              prefix: '/authors',
              field: 'fullname'
            },
            sql: `SELECT id, fullname, avatar, url FROM author`,
            images: ['avatar'] // Default []
          },
          {
            name: 'post',
            path: '/:title',
            sql: `SELECT id, title, image, author as author_id, excerpt, body, created FROM post WHERE published = 1 LIMIT ?`,
            args: [10],
            images: ['avatar']
            subs: []
          }
        ]
      }
    }
  ]
}
```

Relationship ids should be in the format of `xxx_id` where `xxx` is the name of another query