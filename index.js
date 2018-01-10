#!/usr/bin/env node
"use strict";

const chalk = require('chalk');
const clear = require('clear');
const cliSpinners = require('cli-spinners');
const figlet = require('figlet');
const git = require('simple-git')();
const github = new (require('github'))();
const inquirer = require('inquirer');
const logUpdate = require('log-update');
const minimist = require('minimist');
const prefs = new (require('preferences'))('ginit');
const _ = require('lodash');

const files = require('./lib/files');
const args = minimist((process.argv.slice(2)))._;
const spinner = cliSpinners.dots;

clear();
console.log(chalk.yellow(figlet.textSync('Ginit - cli', { horizontalLayout: 'full' })));

if (files.directoryExists('.git')) {
  console.log(chalk.red('This directory is already a git repository. Exiting.'));
  process.exit();
}

function getGithubCredentials(callback) {
  var questions = [
    {
      name: 'username',
      type: 'input',
      message: 'Enter your Github username or e-mail address:',
      validate: function( value ) {
        if (value.length) {
          return true;
        } else {
          return 'Please enter your username or e-mail address.';
        }
      }
    },
    {
      name: 'password',
      type: 'password',
      message: 'Enter your password:',
      validate: function(value) {
        if (value.length) {
          return true;
        } else {
          return 'Please enter your password.';
        }
      }
    }
  ];

  inquirer.prompt(questions).then(callback);
}

function getGithubToken(callback) {
  if (prefs.github && prefs.github.token) {
    return callback(null, prefs.github.token);
  }

  getGithubCredentials(function(credentials) {
    console.log('Authenticating you, please wait...');

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
      fingerprint: 'ginit'
    }, function(err, res) {
      if ( err ) {
        return callback( err );
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
  var argv = require('minimist')(process.argv.slice(2));

  var questions = [
    {
      type: 'input',
      name: 'name',
      message: 'Enter a name for the repository:',
      default: argv._[0] || files.getCurrentDirectoryBase(),
      validate: function( value ) {
        if (value.length) {
          return true;
        } else {
          return 'Please enter a name for the repository.';
        }
      }
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

  inquirer.prompt(questions).then(function(answers) {
    console.log('Creating repository...');

    var data = {
      name : answers.name,
      description : answers.description,
      private : (answers.visibility === 'private')
    };

    github.repos.create(
      data,
      function(err, res) {
        if (err) {
          return callback(err);
        }
        return callback(null, res.ssh_url);
      }
    );
  });
}

function createGitignore(callback) {
  var filelist = _.without(fs.readdirSync('.'), '.git', '.gitignore');

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
    ).then(function( answers ) {
        if (answers.ignore.length) {
          fs.writeFileSync( '.gitignore', answers.ignore.join( '\n' ) );
        } else {
          touch( '.gitignore' );
        }
        return callback();
      }
    );
  } else {
    touch('.gitignore');
    return callback();
  }
}

function setupRepo(url, callback) {
  console.log('Setting up the repository...');

  git
    .init()
    .add('.gitignore')
    .add('./*')
    .commit('Initial commit')
    .addRemote('origin', url)
    .push('origin', 'master')
    .then(function(){
      return callback();
    });
}

function githubAuth(callback) {
  getGithubToken(function(err, token) {
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

githubAuth(function(err, authed) {
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
    createRepo(function(err, url){
      if (err) {
        console.log('An error has occured');
      }
      if (url) {
        createGitignore(function() {
          setupRepo(url, function(err) {
            if (!err) {
              console.log(chalk.green('All done!'));
            }
          });
        });
      }
    });
  }
});
