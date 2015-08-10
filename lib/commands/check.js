// Copyright 2015 Sunnytrail Insight Labs Inc. All rights reserved.

var async = require('async')
  , request = require('request')
  , config = require('../config')
  , path = require('path')
  , util = require('../util')
  , exec = require('../exec')
  , errorMessage = require('../error-message')
  , error = require('../error')
  , CheckerError = error.CheckerError
  , ServerError = error.ServerError
  , analytics = require('../analytics')


function CheckCmd(cli) {
  this.cli = cli
  this.taskUserIndex = parseInt(cli.args[0])
  this.taskIndex = this.taskUserIndex - 1
  this.checkerConfig = null
}


CheckCmd.prototype.run = function(done) {
  var _this = this

  async.series(
      [ function(cb) { _this.setup(cb) }
      , function(cb) { _this.verifyArgs(cb) }
      , function(cb) { _this.runTaskTest(cb) }
      , function(cb) { analytics.track("checker_check", {}, cb) }
      ]
    , analytics.trackErrAndContinue(done)
  )
}


CheckCmd.prototype.verifyArgs = function(done) {
  if (this.taskIndex === NaN || !this.isValidTaskIndex(this.taskIndex)) {
    return done(new CheckerError(errorMessage.invalidTask))
  } else {
    return done(null)
  }
}


CheckCmd.prototype.isValidTaskIndex = function(taskIndex) {
  return taskIndex >= 0 && taskIndex < this.checkerConfig.tasks.length
}


CheckCmd.prototype.setup = function(done) {
  var _this = this

  async.series(
      [ function(cb) { _this.loadConfig(cb) }
      , function(cb) { _this.ensureLatestWorkshopVersion(cb) }
      ]
    , done
  )
}


CheckCmd.prototype.loadConfig = function(done) {
  var _this = this

  util.loadConfig(function(err, checkerConfig) {
    if (err) {
      return done(err)
    }
    if (!checkerConfig.apiKey || !checkerConfig.workshopId) {
      return done(new CheckerError(errorMessage.setupCorrupted))
    }
    _this.checkerConfig = checkerConfig
    done(null, checkerConfig)
  })
}


CheckCmd.prototype.ensureLatestWorkshopVersion = function(done) {
  var _this = this
    , credentials = { apiKey: this.checkerConfig.apiKey
                    , workshopId: this.checkerConfig.workshopId }
    , options = { url: config.workshopVersionURL
                , qs: credentials
                , json: true }

  request.get(options, function(err, response, body) {
    if (err) {
      return done(new ServerError())
    }
    if (response.statusCode == 400) {
      var message = errorMessage.getMessageByType((body || {}).type)
      return done(new ServerError(message))
    }
    if (response.statusCode !== 200) {
      return done(new CheckerError(errorMessage.setupCorrupted))
    }
    if (body.version !== _this.checkerConfig.workshopVersion) {
      _this.cli.info('We\'re updating your configuration...')
      var setup = require('./setup')(_this.cli, credentials)
      setup.run(function(err) {
        if (err) {
          return done(err)
        }
        return _this.loadConfig(done)
      })
    } else {
      done(null)
    }
  })
}


CheckCmd.prototype.runTaskTest = function(done) {
  var _this = this
    , task = this.checkerConfig.tasks[this.taskIndex]

  this.cli.info('Running tests for task: ' + task.name)
  var cmd = config.nodeRunTestCmd + this.checkerConfig.testCommand + ' ' + this.taskUserIndex

  exec(cmd, {cwd: config.localFolder}, function(exitCode) {
    if (exitCode === 0) {
      _this.cli.ok('Task complete!\n\n')
      _this.markTaskComplete(task._id, done)
    } else {
      done(new CheckerError(errorMessage.incompleteTask))
    }
  })
}


CheckCmd.prototype.markTaskComplete = function(taskId, done) {
  var _this = this
    , data = { apiKey: this.checkerConfig.apiKey
             , taskId: taskId }
    , options = { url: config.taskCompleteURL
                , json: data }

  request.post(options, function(err, response, body) {
    if (err) {
      return done(new ServerError())
    }
    if (response.statusCode == 400) {
      var message = errorMessage.getMessageByType((body || {}).type)
      return done(new ServerError(message))
    }
    if (response.statusCode !== 200) {
      return done(new ServerError())
    }
    done(null)
  })
}


module.exports = function(cli) {
  return new CheckCmd(cli)
}
