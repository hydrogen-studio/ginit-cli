const fs = require('fs');
const path = require('path');

module.exports = {
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
  getCurrentDirectoryBase: () => path.basename(process.cwd())
};
