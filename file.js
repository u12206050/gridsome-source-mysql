/* Usage */
/*
const file = require('./file.js')

const imageDirectory = 'tmp_images'
const images = {}
let loadImages = false

// Somewhere on each possible image url
if (url && String(url).match(/^https:\/\/.*\/.*\.(jpg|png|svg|gif|jpeg)($|\?)/i)) {
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

  await Object.keys(images).map(async (id) => {
    const { filename, url, filepath } = images[id]

    if (!file.exists(filepath)) {
      await file.download(url, filepath)
      console.log(`Downloaded ${filename}`)
    } else console.log(`${filename} already exists`)
  })
}
*/


const queue = require('queue')
const https = require('https')
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

const Q = queue()
Q.concurrency = 3
Q.autostart = true
Q.timeout = 5000

function createDirectory(dir) {
  const pwd = path.join(ROOT, dir)
  if (!fs.existsSync(pwd)) fs.mkdirSync(pwd)

  return pwd
}

function getFullPath(dir, filename) {
  return path.join(ROOT, dir, filename)
}

function getFilename(url) {
  return url.replace(/%2F/g, '/').split('/').pop().replace(/\#(.*?)$/, '').replace(/\?(.*?)$/, '')
}

function exists(filepath) {
  return fs.existsSync(filepath)
}

function download(url, path) {
  return new Promise(function(onDone) {
    Q.push(function () {
      console.log(`In Queue: ${Q.length}`)
      return new Promise(function(resolve) {
        console.log(`Downloading: ${url}`)
        const file = fs.createWriteStream(path)
        const request = https.get(url, (response) => {
          response.pipe(file)
          file.on('finish', () => {
            file.close(resolve)
          })
        }).on('error', (err) => {
          console.error(err.message)
          fs.unlink(resolve)
        })
      }).then(onDone)
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