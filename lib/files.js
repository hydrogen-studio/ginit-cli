const fs = require('fs');
const path = require('path');

module.exports = {
  createFile: (name, content) => {
    fs.writeFileSync(name, content);
  },
  directoryExists: (path) => {
    try {
      return fs.statSync(path).isDirectory();
    } catch (e) {
      return false;
    }
  },
  directoryHasFiles: (path) => {
    try {
      return fs.readdirSync(path).length > 0;
    } catch (e) {
      return false;
    }
  },
  getCurrentDirectoryBase: () => path.basename(process.cwd()),
  getDirectoryFiles: (path) =>
    fs.readdirSync(path).filter(f => f !== '.git' && f !== '.gitignore')
};
