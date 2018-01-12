#!/usr/bin/env node
"use strict";

const chalk = require('chalk');
const clear = require('clear');
const clui = require('clui');
const figlet = require('figlet');
const inquirer = require('inquirer');
const Preferences = require('preferences');
const GitHubApi = require('github');
const _ = require('lodash');
const git = require('simple-git')();
const touch = require('touch');
const fs = require('fs');
const files = require('./lib/files');

clear();
console.log(chalk.yellow(figlet.textSync('Ginit - GLI', { horizontalLayout: 'full' })));

if (files.directoryExists('.git')) {
  console.log(chalk.red('This directory is already a git repository. Exiting.'));
  process.exit();
}

const argv = require('minimist')(process.argv.slice(2));
const github = new GitHubApi({ version: '3.0.0' });
const Spinner = clui.Spinner;

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
    const status = new Spinner('Authenticating you, please wait...');
    status.start();

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
      status.stop();
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
    const status = new Spinner('Creating repository...');
    status.start();

    const data = {
      name : answers.name,
      description : answers.description,
      private : (answers.visibility === 'private')
    };

    github.repos.create(
      data,
      function (err, res) {
        status.stop();
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
  const status = new Spinner('Setting up the repository...');
  status.start();

  git
    .init()
    .add('.gitignore')
    .add('./*')
    .commit('Initial commit')
    .addRemote('origin', url)
    .push('origin', 'master')
    .then(function () {
      status.stop();
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

githubAuth(function (err, authed) {
  if (err) {
    switch (err.code) {
      case 401:
        console.log(chalk.red('Couldn\'t log you in. Please try again.'));
        break;
      case 422:
        console.log(chalk.red('You already have an access token.'));
        break;
    }
  }
  if (authed) {
    console.log(chalk.green('Successfully authenticated!'));
    createRepo(function (err, url) {
      if (err) {
        console.log('An error has occured');
      }
      if (url) {
        createInitialFiles(function () {
          setupRepo(url, function (err) {
            if (!err) {
              console.log(chalk.green('All done!'));
            }
          });
        });
      }
    });
  }
});
