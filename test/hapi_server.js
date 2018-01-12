const EventLogger = require('../').EventLogger;
const Hapi = require('hapi');
const bunyan = require('bunyan');
const assert = require('chai').assert;
const request = require('request');
const eventLogger = new EventLogger(bunyan.createLogger({
  name: 'test'
}));

var hapi_plugin = {
  register: function(server, options) {
    return eventLogger.watch(server, { ignorePaths: ['/ignored'] });
  },
  name: 'bunyan-logger',
  version: '1.0.0',
};

describe('watch Hapi server', function () {
  var server;

  before(async function() {
    server = Hapi.server({ host: 'localhost', port: 9876 });
    server.route({
      method: 'GET',
      path: '/',
      handler: function(request) {
        return 'Hello world!';
      }
    });
    server.route({
      method: 'GET',
      path: '/ignored',
      handler: function(request) {
        return 'ignored!';
      }
    });
    server.route({
      method: 'GET',
      path: '/slow',
      handler: function(request) {
        return new Promise((resolve) =>
          setTimeout(function () {
            return resolve('Hellooooooo sloooooow woooooorld!');
          }, 1500)
        );
      }
    });
    await server.register(hapi_plugin);
    return server.start();
  });

  it('should log response time', function (done) {
    eventLogger.logger.info = function(log_event) {
      assert.isNumber(log_event.took);
      assert.isAbove(log_event.took, 0);
    };
    request.get(server.info.uri + '/', function (error, response, body) {
      assert.equal(body, 'Hello world!');
      done();
    });
  });

  it('should log request on aborted request', function (done) {
    eventLogger.logger.info = function(log_event, msg) {
      assert.isNumber(log_event.took);
      assert.isAbove(log_event.took, 0);
      assert.equal(log_event.log_type, 'request_aborted');
      assert.isString(log_event.req.info.id);
      assert.equal(msg, 'request aborted');
      done();
    };

    const req = request.get(server.info.uri + '/slow', () => {});

    setTimeout(() => {
      req.abort();
    }, 50);
  });

  it('should log response time in a slow endpoint', function (done) {
    eventLogger.logger.info = function(log_event) {
      assert.isNumber(log_event.took);
      assert.isAbove(log_event.took, 1500);
    };
    request.get(server.info.uri + '/slow', function (error, response, body) {
      assert.equal(body, 'Hellooooooo sloooooow woooooorld!');
      done();
    });
  });

  it('should not log ignored endpoints', function (done) {
    eventLogger.logger.info = function(log_event) {
      throw done(new Error('info should not have been called'));
    };
    request.get(server.info.uri + '/ignored', function (error, response, body) {
      assert.equal(body, 'ignored!');
      done();
    });
  });

});
