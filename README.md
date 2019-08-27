# Gridsome source MySQL

**Alternate version with image cdn support using [cloudinary](https://cloudinary.com/invites/lpov9zyyucivvxsnalc5/n4iiwbfiyryrdnlqkrye) and [jsonbin.io](https://jsonbin.io)**

Gridsome Source Plugin to load data directly from MySQL Database

  * If you don't succeed through a CMS, bypass it and load the data directly from the MySQL Database

  * Specify names of columns containing image urls to download and optimized them with Gridsome. Supports single and comma delimited image urls.

  * Build up your mysql queries as you need to get the data you require.

  * Supports sub queries and references between content types

  * `id` field from mysql is renamed to `mysqlId`

  * Content type references via `xxx_id`(single id) and `xxx_ids`(comma delimited ids)

  * Cloudinary images also have placeholders which will be generated and saved to jsonstore for future builds.


View the [changelog](https://github.com/u12206050/gridsome-source-mysql/blob/master/CHANGELOG.md) for any possible changes from previous versions.

### Latest Updates

  *2.7.0* BREAKING CHANGE: Switched from jsonstore to jsonbin

  *2.6.0* Added optimsed for cloudinary g-image

## Install

  `npm install gridsome-source-mysql-cloudinary --save`

## Setup

> Make sure your mysql database is accessible everywhere you are planning to build your site from.

### Cloudinary (for images)

Create a FREE account on [cloudinary](https://cloudinary.com/invites/lpov9zyyucivvxsnalc5/n4iiwbfiyryrdnlqkrye) and then enable auto uploading by doing the following:

  1. Navigate to [settings > upload](https://cloudinary.com/console/settings/upload)
  2. Then under `Auto upload mapping` in the `Folder` field add the name of the directory where all your images are. They may be in subdirectories as well. eg. `media`
  3. Add the the full url that includes the folder name in the `URL prefix` field eg. `https://example.no/media/`
  4. In the config (see below) update the `name`, `folder` and `match` fields.
  5. Update all your queries where you query for images to include the srcset and other required fields. (See example **Usage** below)

### Use the optimized CloudinaryImage as `g-image`

In `main.js` import and override Gridsome's image component with CloudinaryImage. As a drop-in-replacement we will call it `g-image` so your code does not need to be updated.

```
// main.js

import CloudinaryImage from 'gridsome-source-mysql-cloudinary/CloudinaryImage'

export default function(Vue) {

  /* Drop-in-replacement for Gridsome's image */
  Vue.component('g-image', CloudinaryImage)

}
```

### [Jsonbin](https://jsonbin.io)

Create a free account which should be enough transactions if you aren't building too often with too many images.
Update the config as specified below with you jsonbin key, binId (which you create before hand), and optional collectionId to group all your image bins.

### Config

Within plugins in the `gridsome-config.js` file, add the connection settings and queries for the data you need.

```javascript:title=gridsome-config.js
// gridsome-config.js

module.exports = {
  plugins: [
    {
      use: 'gridsome-source-mysql-cloudinary',
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
        ignoreImages: false, // Do not process any images
        jsonbin: { // Create a free account on [jsonbin.io](https://jsonbin.io)
          key: process.env.JSONBIN_KEY, // Secret key from [jsonbin.io](https://jsonbin.io/api-keys)
          binId: process.env.JSONBIN_BIN, // The id of the bin to save data too
          collectionId: process.env.JSONBIN_COLLECTION, // (optional) The id of the collection in which to save additional bins
        },
        cloudinary: {
          name: 'example',
          folder: 'media',
          uri: 'c_scale,e_vectorize,w_50', // Scaling for svg placeholder
          sizes: ['480', '800'],
          match: /https?:\/\/(www\.)?example\.no\/media\// // Url to match for images and swap out for the cloudinary url
        },
        regex: /()_\d(.(jpg|png|svg|jpeg))/i, // Default false
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
        image {
          src
          dataUri
          srcset
          size {
            width
            height
          }
        }
        gallery {
          index
          image {
            src
            dataUri
            srcset
            size {
              width
              height
            }
          }
        }
        excerpt
        author {
          fullname
          url
          image {
            src
            dataUri
            srcset
            size {
              width
              height
            }
          }
        }
      }
    }
  }
}
```

## Definitions

### Options

  *regex*: Specify false to not use or a `regex` expression that has 2 capture groups. This can be used to remove duplicate files for example the value `/()_\d(.(jpg|png|svg|jpeg))/i` renames all files that end with `_\d` eg. `_1`, `_2`; since we assume them to be duplicate files. We DO NOT change the source url since it might be the original file (not ending with `_\d`) isn't used.

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
json | array<string> | Names of fields containing json to be converted to objects else `null`
images? | array<string|string[]|function(row, addImageUrl(url: string))> | Names of fields on rows that contain urls of images to download and optimize via Gridsome
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


### The drop-in-replacement, CloudinaryImage

This drop-in version will filter through the appropriate sizes available, eg. `sizes: ['480', '800', '1200']`, on each image, such that even though larger images exist it will only use the image that is `>= width`, width being speicified on the tag.

Example: `<g-image :src="image" width="600">` here the image with the generated size of `800` will be used, and not `1200`.