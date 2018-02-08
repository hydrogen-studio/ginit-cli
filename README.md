# Ginit CLI [![travis][travis]][travis-url]

A cli for easy `git init`ing.

## Install

```bash
$ npm install -g ginit-cli
```

## Usage

```bash
$ ginit --help

  Usage
    ginit [command] [option]

    The command argument is optional. If no command is given, the
    init command will be run.

  Commands
    auth                 Sign into github
    init                 Initialize current directory as git repository

  Options
    --interactive, -i    Enter interactive mode
    --force, -f          Force initialization
    --version, -v        Print version
    --help, -h           Print help

  Examples
    ginit auth           # Sign into github
    ginit                # Initialize current directory as git repository
    ginit -i             # Enter interactive mode
```

[travis]: https://travis-ci.org/timdavish/ginit-cli.svg
[travis-url]: https://travis-ci.org/timdavish/ginit-cli
