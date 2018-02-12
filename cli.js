#!/usr/bin/env node
"use strict";

const chalk = require('chalk');
const meow = require('meow');
const inquirer = require('inquirer');
const github = require('github')();
const simpleGit = require('simple-git')();
const Preferences = require('preferences');

const files = require('./lib/files');
const pkg = require('./package.json');

const prefs = new Preferences('ginit');

const cli = meow({
  description: false,
  help: `
    Usage
      ${chalk.yellow('ginit [command] [option]')}

      The command argument is optional. If no command is provided,
      then the ${chalk.yellow('init')} command will be run by default.

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

async function runAuth () {
  const { username, password } = await promptAuth();

  github.authenticate({ type: 'basic', username, password });

  await github.authorization.create({
    scopes: ['user', 'public_repo', 'repo', 'repo:status'],
    note: 'ginit: cli for easy `git init`ing',
    fingerprint: `ginit v${pkg.version}`
  }, (err, res) => {
    if (err) {
      switch (err.code) {
        case 401:
          console.log(chalk.red('Couldn\'t log you in. Please try again.'));
          break;
        case 422:
          console.log(chalk.red('You already have an access token.'));
          console.log(`Try revoking your ginit access token and then trying again.`);
          console.log('  url: https://github.com/settings/tokens');
          break;
      }
    } else if (res.data.token) {
      prefs.github = {
        token: res.data.token
      };
      console.log(chalk.green('Successfully authenticated.'));
    }
  });
}

async function runInit (interactive, force) {
  const token = prefs.github ? prefs.github.token : false;

  if (!token) {
    console.log(chalk.red('Unauthorized. Please ensure you are logged in using `ginit auth`.'));
    process.exit(1);
  }

  if (files.directoryExists('.git')) {
    console.log(chalk.red('This directory is already a git repository. Exiting.'));
    process.exit(1);
  }

  if (!files.directoryHasFiles('.') && !interactive && !force) {
    console.log(chalk.red('This directory has no files to commit. Try running in interactive or force modes.'));
    process.exit(1);
  }

  github.authenticate({ type: 'oauth', token });

  const data = {};

  if (interactive) {
    const { name, description, visibility } = await promptCreateQuestions();

    data.name = name;
    data.description = description;
    data.private = (visibility === 'private');

    const { wantReadme, wantIgnore } = await promptFileQuestions(name);

    if (wantReadme) {
      const content = `# ${name}`;

      files.createFile('README.md', content);
    }
    if (wantIgnore) {
      const defaults = [
        'node_modules',
        '.DS_Store',
        '*.log'
      ];

      files.createFile('.gitignore', defaults.join('\n'));
    }
  }

  try {
    const { data: repoData } = await createRepository(data);
    const fileStatus = await setupRepository(repoData.ssh_url);

    console.log(chalk.green(`Repository initalized ${fileStatus}.`));
  } catch (e) {
    console.log(chalk.red(e));
  }
}

function promptAuth () {
  return inquirer.prompt([
    {
      name: 'username',
      message: 'Enter your Github username or e-mail address:',
      type: 'input',
      validate: val => val.length ? true : 'Input required'
    },
    {
      name: 'password',
      message: 'Enter your password:',
      type: 'password',
      validate: val => val.length ? true : 'Input required'
    }
  ])
}

function promptCreateQuestions () {
  return inquirer.prompt([
    {
      name: 'name',
      message: 'Enter a name for the repository:',
      type: 'input',
      default: files.getCurrentDirectoryBase(),
      validate: val => val.length ? true : 'Input required'
    },
    {
      name: 'description',
      message: 'Enter a description for the repository (optional):',
      type: 'input',
      default: null
    },
    {
      name: 'visibility',
      message: 'Public or private:',
      type: 'list',
      choices: [ 'public', 'private' ],
      default: 'public'
    }
  ]);
}

function promptFileQuestions (name) {
  return inquirer.prompt([
    {
      name: 'wantReadme',
      message: 'Do you want to create a README.md?',
      type: 'confirm'
    },
    {
      name: 'wantIgnore',
      message: 'Do you want to create a .gitignore?',
      type: 'confirm'
    }
  ]);
}

function createRepository (data) {
  if (!data.name) {
    data.name = files.getCurrentDirectoryBase();
  }

  return github.repos.create(data);
}

function setupRepository (url) {
  if (files.directoryHasFiles('.')) {
    simpleGit.init()
      .add('.')
      .commit('Initial commit')
      .addRemote('origin', url)
      .push('origin', 'master')

    return 'with files';
  } else {
    simpleGit.init()
      .addRemote('origin', url)

    return 'without files';
  }
}
