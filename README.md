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
            name: 'Author',
            path: {
              prefix: '/authors',
              field: 'fullname'
            },
            sql: `SELECT id, fullname, avatar, url FROM author`,
            images: ['avatar'] // Default []
          },
          {
            name: 'Post',
            path: 'title',
            sql: `SELECT id, title, image, author as author_id, excerpt, body, created FROM post WHERE published = ?`,
            args: [1],
            images: ['image']
          }
        ]
      }
    }
  ]
}
```

Relationship ids should be in the format of `xxx_id` where `xxx` is the name of another query

## Usage

On the above example two content types will be created `Post` and `Author` with `author_id` being a relation:

```
query {
  allPost {
    edges {
      node {
        title
        path
        image
        excerpt
        author {
          fullname
          url
          avatar (width: 100, height: 100)
        }
      }
    }
  }
}
```

## Definitions

### Query

Field | Type | Info
---|---|---
name | string | Name of the resulting content type
path | function(slugify, row, parentRow?): string | Return the path for the given row
path | { prefix?: string, field: string, suffix?: string } | Field should exist on each row and will be slugified
path | string | Name of a field on each row to slugify and use as path
sql | string | A SQL Query with optional placeholders `?` which will be replaced by args in order
args? | array<string> | Simple array of static values
args? | function(parentRow?): array<string> | Return array of values based on data from the parentRow or dynamic calculated data, eg. [Date.now()]
images? | array<string> | Names of fields on rows that contain urls of images to download and optimize via Gridsome
subs | array<Query> | Array of Query to execute per result of the current query

