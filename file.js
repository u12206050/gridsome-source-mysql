const https = require('https')
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

exports function createDirectory(dir) {
  const pwd = path.join(ROOT, dir)
  if (!fs.existsSync(pwd)) fs.mkdirSync(pwd)

  return pwd
}

exports function getFullPath(dir, filename) {
  return path.join(ROOT, dir, filename)
}

exports function getFilename(url) {
  return url.replace(/%2F/g, '/').split('/').pop().replace(/\#(.*?)$/, '').replace(/\?(.*?)$/, '');
}

exports function download(url, path) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(path);
    const request = https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest);
      throw new Error(err.message);
    });
  })
}
