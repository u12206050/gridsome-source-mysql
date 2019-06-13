# Gridsome source MySQL

Gridsome Source Plugin to load data directly from MySQL Database

  * If you don't succeed through a CMS, bypass it and load the data directly from the MySQL Database

  * Specify names of columns containing image urls to download and optimized them with Gridsome. Supports single and comma delimited image urls.

  * Build up your mysql queries as you need to get the data you require.

  * Supports sub queries and references between content types

  * Content type references via `xxx_id`(single id) and `xxx_ids`(comma delimited ids)


View the [changelog](https://github.com/u12206050/gridsome-source-mysql/blob/master/CHANGELOG.md) for any possible changes from previous versions.

### Latest Updates

  *v1.4.6* Cache on Netlify
  *v1.4.5* Support for dynamic routes added

## Install

  `npm install gridsome-source-mysql --save`

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
          host: 'localhost', // required
          port: 3306,
          user: 'root', // required
          password: 'secret', // required
          database: 'my_db', // required
          connectionLimit : 10
        },
        debug: true, // Default false on production
        ignoreImages: false, // Do not download any images
        imageDirectory: 'sql_images',
        queries: [ // required
          {
            name: 'Author',
            route: '/authors/:path',
            path: 'fullname',
            sql: `SELECT id, fullname, avatar, url FROM author`,
            images: ['avatar'] // Default []
          },
          {
            name: 'Post',
            path: 'title',
            sql: `SELECT id, title, image, gallery, author as author_id, excerpt, body, created FROM post WHERE published = ?`,
            args: [1],
            images: ['image', ['gallery']] //Gallery contains comma delimited string of image url.
          }
        ]
      }
    }
  ]
}
```

Relationship ids should be in the format of `xxx_id` where `xxx` is the name of another query.

## Usage

On the above example two content types will be created `Post` and `Author` with `author_id` being a relation:

```
query {
  allPost {
    edges {
      node {
        title
        path
        image (width: 600, height: 600)
        gallery {
          index
          image (width: 400, height: 400)
        }
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
route? | string | Specify a [dynamic route](https://gridsome.org/docs/routing) structure eg. `/blog/:path`
path | function(slugify, row, parentRow?): string | Return the path for the given row
path | { prefix?: string, field: string, suffix?: string } | `field` should exist on each row and will be slugified
path | string | Name of a field on each row to slugify and use as path
sql | string | A SQL Query with optional placeholders `?` which will be replaced by args in order
args? | array<string> | Simple array of static values
args? | function(parentRow?): array<string> | Return array of values based on data from the parentRow or dynamic calculated data, eg. [Date.now()]
images? | array<string|string[]> | Names of fields on rows that contain urls of images to download and optimize via Gridsome
subs | array<Query> | Array of Query to execute per result of the current query

# MySQL Query Examples

## Generate comma seperated urls and ids

The following is an example of how you can generated the fields for using as a `one-to-many` relationship in graphql and also joining image urls.

```
queries: [
  {
    name: 'Product',
    path: 'slug',
    images: ['image', ['gallery']] // Default []
    sql: `SELECT
      pc.product_id as id,
      cats.category_ids,
      pc.sku,
      pc.name,
      pc.price,
      pc.slug,
      CONCAT('https://example.com/media/', pc.image) as image,
      media.images as 'gallery',
      FROM product_catalog pc
      INNER JOIN (
          SELECT product_id, GROUP_CONCAT(CONCAT('https://example.com/media/catalog/product',value)) AS 'images'
          FROM product_media
          GROUP BY product_id
        ) media
      ON media.product_id = pc.product_id
      INNER JOIN (
          SELECT product_id, GROUP_CONCAT(category_id) AS 'category_ids'
          FROM product_category
          GROUP BY product_id
        ) cats
      ON cats.product_id = pc.product_id
      WHERE pc.status = 1`
  },
  {
    name: 'Category',
    route: '/category/:path',
    path: 'path',
    images: ['image'],
    sql: `SELECT
      category_id AS 'id',
      name,
      CONCAT('https://example.com/media/', image) as image,
      parent_id AS 'category_id',
      position,
      level,
      product_count AS 'count'
      FROM category_catelog
      WHERE active = 1`
  }
]
```

In the above example `cats.category_ids` will result in an array of `Category` content types if you have specified a query for `Category`

Images in this database were relative, so in order for them to be downloaded they need to be concatenated with the site origin.

In the `Category` query, we change the `parent_id` to output as `category_id` since we want it to be linked to another `Category` automatically.