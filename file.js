/* Usage */
/*
const file = require('./file.js')

const imageDirectory = 'tmp_images'
const images = {}
let loadImages = false

// Somewhere on each possible image url
if (url && String(url).match(/^https:\/\/.*\/.*\.(jpg|png|svg|jpeg)($|\?)/i)) {
  const filename = file.getFilename(url)
  const id = makeUid(url)
  const filepath = file.getFullPath(imageDirectory, filename)
  if (!images[id]) images[id] = {
    filename,
    url,
    filepath
  }

  loadImages = true

  // Assign filepath as the new value for the image
  obj[imgField] = filepath
}

// After processing all fields
if (loadImages) await downloadImages(images)

async function downloadImages(images) {
  file.createDirectory(imageDirectory)

  let exists = 0
  const download = []
  Object.keys(images).forEach(async (id) => {
    const { filename, filepath } = images[id]

    if (!file.exists(filepath)) {
      download.push(images[id])
    } else exists++
  })

  ISDEV && console.log(`${exists} images already exists and ${download.length} to download`)

  if (download.length) {
    await pMap(download, async ({ filename, url, filepath }) => {
      await file.download(url, filepath)
      ISDEV && console.log(`Downloaded ${filename}`)
    }, {
      concurrency: os.cpus * 2
    })
  }
}
*/

const https = require('https')
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const TMPDIR = '.temp/downloads'
let tmpCount = 0

function createDirectory(dir) {
  const pwd = path.join(ROOT, dir)
  if (!fs.existsSync(pwd)) fs.mkdirSync(pwd)

  return pwd
}

createDirectory(TMPDIR)

function getFullPath(dir, filename) {
  return path.join(ROOT, dir, filename)
}

function getFilename(url, regex) {
  let name = url.replace(/%2F/g, '/').split('/').pop().replace(/\#(.*?)$/, '').replace(/\?(.*?)$/, '')
  return regex ? name.replace(regex, '$1$2') : name
}

function exists(filepath) {
  return fs.existsSync(filepath)
}

function download(url, path) {
  return new Promise(function(resolve) {
    const tmpPath = getFullPath(TMPDIR, `${++tmpCount}.tmp`)
    const file = fs.createWriteStream(tmpPath)
    const request = https.get(url, (response) => {
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        fs.rename(tmpPath, path, resolve)
      })
    }).on('error', (err) => {
      console.error(err.message)
      fs.unlink(String(tmpPath), resolve)
    })
  })
}

module.exports = {
  createDirectory,
  getFullPath,
  getFilename,
  exists,
  download
}