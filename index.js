'use strict';

var utils = require('./utils');

module.exports = function (allowWrapper) {
  if (allowWrapper) {
    global.setImmediate = wrapCallbackFirst(global, 'setImmediate');
    process.nextTick = wrapCallbackFirst(process, 'nextTick');
    global.activeSetImmediateAndNextTick = {counter: 0};
  }

  return {
    dump: function () {
      var handles = {};
      var requests = {};
      var setImmediates = [];
      var nextTicks = [];

      process._getActiveHandles().forEach(function (h) {
        if (!h) {
          return;
        }

        // skip stdio
        if (isStdIO(h)) {
          return;
        }

        var obj = {
          type: h.constructor.name
        };

        if (obj.type === 'Server') {
          utils.extractServer(obj, h);
        } else if (obj.type === 'Socket') {
          utils.extractSocket(obj, h);
        } else if (obj.type === 'Timer') {
          utils.extractTimer(obj, h);
        } else if (obj.type === 'ChildProcess') {
          utils.extractChildProcess(obj, h);
        }

        // create array if this is the first item of this type
        if (!handles[obj.type]) {
          handles[obj.type] = [];
        }

        handles[obj.type].push(obj);
      });

      process._getActiveRequests().forEach(function (r) {
        if (!r) {
          return;
        }

        // skip stdio
        if (isStdIO(r)) {
          return;
        }

        var obj = {
          type: r.constructor.name
        };

        if (obj.type === 'TCPConnectWrap') {
          utils.extractTCPWrap(obj, r);
        }

        // create array if this is the first item of this type
        if (!requests[obj.type]) {
          requests[obj.type] = [];
        }

        requests[obj.type].push(obj);
      });

      for (var key in global.activeSetImmediateAndNextTick) {
        var item = global.activeSetImmediateAndNextTick[key];
        if (item.type === 'setImmediate') {
          setImmediates.push(item);
        } else if (item.type === 'nextTick') {
          nextTicks.push(item);
        }
      }

      return {
        handles: handles,
        requests: requests,
        setImmediates: setImmediates,
        nextTicks: nextTicks
      };
    }
  };
};

function isStdIO (obj) {
  if ((obj.constructor.name === 'WriteStream' || obj.constructor.name === 'WriteWrap') && (obj._isStdio || (obj.handle && obj.handle.owner && obj.handle.owner._isStdio))) {
    return true;
  }

  return false;
}

function wrapCallbackFirst (mod, name) {
  var orig = mod[name];

  return function () {
    // clone arguments so we can inject our own callback
    var args = [];
    for (var n = 0; n < arguments.length; n++) {
      args[n] = arguments[n];
    }

    // inject our own callback
    var userCallback = args[0];

    global.activeSetImmediateAndNextTick[global.activeSetImmediateAndNextTick.counter] = {
      type: name,
      name: userCallback.name || 'anonymous'
    };

    (function (index) {
      args[0] = function () {
        delete global.activeSetImmediateAndNextTick[index];

        // call the original callback
        return userCallback.apply(this, arguments);
      };
    })(global.activeSetImmediateAndNextTick.counter);

    global.activeSetImmediateAndNextTick.counter++;

    return orig.apply(mod, args);
  };
}
