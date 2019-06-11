1.3.2 Check relation name

  * Implemented a check for a query with the name `xxx` from `xxx_id` before creating a relation.

1.3.1 Changed `_id` field containing original id to `mysqlId`

  * Unpublished version 1.3.0

1.3.0 Support for array of image urls. Keep original ID

  * Within the image options field for each query you can specify an array with the one and only element being the field name of the field containing a comma delimited string of image urls to be downloaded.

  * The original id value if one exists will now be available as `mysqlId`

1.2.2 Support for string array of ids

  * Fields in the form of `xxx_ids` will now be parsed as a comma delimited string of ids that will be split up and used to create relationships of.

1.2.0 Added download queue

  * When downloading a lot of images, it helps having a queue to regulate how many files to download in parallel. Currently setting to 3

1.1.0 Fixed ID Field