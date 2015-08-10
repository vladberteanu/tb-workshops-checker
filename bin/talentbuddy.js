#!/usr/bin/env node

var cli = require('cli')
  , async = require('async')
  , config = require('../lib/config')
  , util = require('../lib/util')
  , error = require('../lib/error')


cli.parse(config.options, config.commands)


async.series(
    [ function(cb) { util.runPrechecks(cli, cb) }
    , function(cb) { util.runCommand(cli, cb) }
    ]
  , function(err) {
      if (err) {
        error.printError(err, cli)
        if (cli.options.debug) {
          console.log(err)
        }
      }
      cli.exit()
    }
)
