#!/usr/bin/env node
"use strict";

const chalk = require('chalk');
const meow = require('meow');
const inquirer = require('inquirer');
const github = require('github')();
const simpleGit = require('simple-git')();

const Preferences = require('preferences');
const _ = require('lodash');
const touch = require('touch');
const fs = require('fs');

const files = require('./lib/files');

const cli = meow({
  description: false,
  help: `
    Usage
      ${chalk.yellow('ginit [command] [option]')}

      The command argument is optional. If no command is given, the
      init command will be run.

    Commands
      ${chalk.yellow('auth')}                 Sign into github
      ${chalk.yellow('init')}                 Initialize current directory as git repository

    Options
      ${chalk.yellow('--interactive, -i')}    Enter interactive mode
      ${chalk.yellow('--force, -f')}          Force initialization
      ${chalk.yellow('--version, -v')}        Print version
      ${chalk.yellow('--help, -h')}           Print help

    Examples
      ginit auth           ${chalk.dim('# Sign into github')}
      ginit                ${chalk.dim('# Initialize current directory as git repository')}
      ginit -i             ${chalk.dim('# Enter interactive mode')}
  `,
  flags: {
    interactive: {
      type: 'boolean',
      alias: 'i'
    },
    force: {
      type: 'boolean',
      alias: 'f'
    },
    version: {
      type: 'boolean',
      alias: 'v'
    },
    help: {
      type: 'boolean',
      alias: 'h'
    }
  }
});

run(cli.input, cli.flags);

function run (input, flags) {
  const command = input[0];
  const interactive = flags.interactive;
  const force = flags.force;

  switch (command) {
    case 'auth': return runAuth();
    case 'init':
    default: return runInit(interactive, force);
  }
}

function runAuth () {}

function runInit (interactive, force) {
  const prefs = new Preferences('ginit');
  const token = prefs.github ? prefs.github.token : false;
  const hasFiles = files.directoryHasFiles('.');

  if (!token) {
    console.log(chalk.red('Unauthorized. Please ensure you are logged in using `ginit auth`.'));
    process.exit(1);
  }

  if (files.directoryExists('.git')) {
    console.log(chalk.red('This directory is already a git repository. Exiting.'));
    process.exit(1);
  }

  if (!hasFiles && !interactive && !force) {
    console.log(chalk.red('This directory has no files to commit. Try running in interactive or force modes.'));
    process.exit(1);
  }

  authenticate(token);

  if (!interactive) {
    const repoData = createRepository();
    setupRepository(repoData.ssh_url, hasFiles);
  } else {
    // Do current prompt session
  }

  console.log(chalk.green('Repository initalized.'))
}

function authenticate (token) {
  github.authenticate({
    type: 'oauth',
    token
  })
}

async function createRepository () {
  const data = {
    name: files.getCurrentDirectoryBase(),
    private: false
  }
  const response = await github.repos.create(data);

  return response.data;
}

async function setupRepository (url, hasFiles) {
  if (hasFiles) {
    simpleGit.init()
      .add('.')
      .commit('Initial commit')
      .addRemote('origin', url)
      .push('origin', 'master')
  } else {
    simpleGit.init()
      .addRemote('origin', url)
  }
}


const argv = require('minimist')(process.argv.slice(2));

function getGithubCredentials(callback) {
  const questions = [
    {
      name: 'username',
      type: 'input',
      message: 'Enter your Github username or e-mail address:',
      validate: val => val.length ? true : 'Input required'
    },
    {
      name: 'password',
      type: 'password',
      message: 'Enter your password:',
      validate: val => val.length ? true : 'Input required'
    }
  ];

  inquirer.prompt(questions).then(callback);
}

function getGithubToken(callback) {
  const prefs = new Preferences('ginit');

  if (prefs.github && prefs.github.token) {
    return callback(null, prefs.github.token);
  }

  getGithubCredentials(function (credentials) {

    github.authenticate(
      _.extend(
        {
          type: 'basic',
        },
        credentials
      )
    );

    github.authorization.create({
      scopes: ['user', 'public_repo', 'repo', 'repo:status'],
      note: 'ginit, the command-line tool for initalizing Git repos',
      fingerprint: 'ginit.'
    }, function (err, res) {
      if (err) {
        return callback(err);
      }
      if (res.token) {
        prefs.github = {
          token : res.token
        };
        return callback(null, res.token);
      }
      return callback();
    });
  });
}

function createRepo(callback) {
  const questions = [
    {
      type: 'input',
      name: 'name',
      message: 'Enter a name for the repository:',
      default: argv._[0] || files.getCurrentDirectoryBase(),
      validate: val => val.length ? true : 'Input required'
    },
    {
      type: 'input',
      name: 'description',
      default: argv._[1] || null,
      message: 'Optionally enter a description of the repository:'
    },
    {
      type: 'list',
      name: 'visibility',
      message: 'Public or private:',
      choices: [ 'public', 'private' ],
      default: 'public'
    }
  ];

  inquirer.prompt(questions).then(function (answers) {
    const data = {
      name : answers.name,
      description : answers.description,
      private : (answers.visibility === 'private')
    };

    github.repos.create(
      data,
      function (err, res) {
        if (err) {
          return callback(err);
        }
        return callback(null, res.ssh_url);
      }
    );
  });
}

function createInitialFiles(callback) {
  const readmeQuestion = [{
    type: 'confirm',
    name: 'wantReadme',
    message: 'Do you want to create a README.md?'
  }];

  inquirer.prompt(readmeQuestion).then(function (answers) {
    return answers.wantReadme;
  }).then(function (wantReadme) {
    if (wantReadme) {
      fs.writeFileSync('README.md', `# ${argv._[0] || files.getCurrentDirectoryBase()}`);
    }
  }).then(function () {
    const filelist = _.without(fs.readdirSync('.'), '.git', '.gitignore');

    if (filelist.length) {
      inquirer.prompt(
        [
          {
            type: 'checkbox',
            name: 'ignore',
            message: 'Select the files and/or folders you wish to ignore:',
            choices: filelist,
            default: ['node_modules', 'bower_components']
          }
        ]
      ).then(function (answers) {
          if (answers.ignore.length) {
            fs.writeFileSync('.gitignore', answers.ignore.join('\n'));
          } else {
            touch('.gitignore');
          }
          return callback();
        }
      );
    } else {
      touch('.gitignore');
      return callback();
    }
  });
}

function setupRepo(url, callback) {
  git
    .init()
    .add('.gitignore')
    .add('./*')
    .commit('Initial commit')
    .addRemote('origin', url)
    .push('origin', 'master')
    .then(function () {
      return callback();
    });
}

function githubAuth(callback) {
  getGithubToken(function (err, token) {
    if (err) {
      return callback(err);
    }
    github.authenticate({
      type : 'oauth',
      token : token
    });
    return callback(null, token);
  });
}

// githubAuth(function (err, authed) {
//   if (err) {
//     switch (err.code) {
//       case 401:
//         console.log(chalk.red('Couldn\'t log you in. Please try again.'));
//         break;
//       case 422:
//         console.log(chalk.red('You already have an access token.'));
//         break;
//     }
//   }
//   if (authed) {
//     console.log(chalk.green('Successfully authenticated!'));
//     createRepo(function (err, url) {
//       if (err) {
//         console.log('An error has occured');
//       }
//       if (url) {
//         createInitialFiles(function () {
//           setupRepo(url, function (err) {
//             if (!err) {
//               console.log(chalk.green('All done!'));
//             }
//           });
//         });
//       }
//     });
//   }
// });
