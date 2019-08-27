2.7.0 [BREAKING] Changed from jsonstore to jsonbin.io format
  * Requires creating free account with jsonbin.io and updating parameters.

2.6.0 Added optimsed for cloudinary g-image

  * Component to replace Gridsome's image in order to better use images from Cloudinary

2.5.0 Support for parsing json

  * Version bump to match mysql-plugin

  * Support callback function in images.

2.0.0 Alternate version including cloudinary

  * Store images on cloudinary with support for placeholders and dynamic resizing etc.

1.4.10 Removed support for GIF, since it breaks when trying to optimize

1.4.7 Added regex option to clean up image file names

  * Useful for removing duplicate images that are the same.

1.4.5 Support for dynamic routes added

  * Now you can make use of dynamic routes by specifying a `route` for your query. This saves space in the final `routes.js` file eg:

  **Before**
  ```
  {
    name: 'Author',
    path: {
      prefix: '/author',
      field: 'name'
    },
    …
  }
  ```

  **After**
  ```
  {
    name: 'Author',
    route: '/author/:path',
    path: 'name',
    …
  }
  ```

  * Read more about Gridsome routing [here](https://gridsome.org/docs/routing)

1.4.3 Added back status output for downloading files

1.4.2 Fixed version 1.4.0

1.4.0 *Broken Version* Swapped out queue for [p-Map](https://github.com/sindresorhus/p-map)

1.3.3 Set download concurrency to no of cpus

1.3.2 Check relation name

  * Implemented a check for a query with the name `xxx` from `xxx_id` before creating a relation.

1.3.1 Changed `_id` field containing original id to `mysqlId`

  * Unpublished version 1.3.0

1.3.0 *Broken Version* Support for array of image urls. Keep original ID

  * Within the image options field for each query you can specify an array with the one and only element being the field name of the field containing a comma delimited string of image urls to be downloaded.

  * The original id value if one exists will now be available as `mysqlId`

1.2.2 Support for string array of ids

  * Fields in the form of `xxx_ids` will now be parsed as a comma delimited string of ids that will be split up and used to create relationships of.

1.2.0 Added download queue

  * When downloading a lot of images, it helps having a queue to regulate how many files to download in parallel. Currently setting to 3

1.1.0 Fixed ID Field