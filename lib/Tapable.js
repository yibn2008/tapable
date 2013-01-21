/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
function Tapable() {
	this._plugins = {};
}
module.exports = Tapable;

Tapable.mixin = function mixinTapable(pt) {
	for(var name in Tapable.prototype)
		pt[name] = Tapable.prototype[name];
}

Tapable.prototype.applyPlugins = function applyPlugins(name) {
	if(!this._plugins[name]) return;
	var args = Array.prototype.slice.call(arguments, 1);
	var plugins = this._plugins[name];
	var old = this._currentPluginApply;
	for(this._currentPluginApply = 0; this._currentPluginApply < plugins.length; this._currentPluginApply++)
		plugins[this._currentPluginApply].apply(this, args);
	this._currentPluginApply = old;
};

Tapable.prototype.applyPluginsBailResult = function applyPluginsBailResult(name) {
	if(!this._plugins[name]) return;
	var args = Array.prototype.slice.call(arguments, 1);
	var plugins = this._plugins[name];
	var old = this._currentPluginApply
	for(this._currentPluginApply = 0; this._currentPluginApply < plugins.length; this._currentPluginApply++) {
		var result = plugins[this._currentPluginApply].apply(this, args);
		if(typeof result !== "undefined") {
			this._currentPluginApply = old;
			return result;
		}
	}
	this._currentPluginApply = old;
};

Tapable.prototype.applyPluginsAsync = function applyPluginsAsync(name) {
	var args = Array.prototype.slice.call(arguments, 1);
	var callback = args.pop();
	if(!this._plugins[name] || this._plugins[name].length == 0) return callback();
	var plugins = this._plugins[name];
	var old = this._currentPluginApply;
	this._currentPluginApply = 0;
	args.push(function next(err) {
		if(err) return callback(err);
		this._currentPluginApply++;
		if(this._currentPluginApply >= plugins.length) {
			this._currentPluginApply = old;
			return callback();
		}
		plugins[this._currentPluginApply].apply(this, args);
	}.bind(this));
	plugins[0].apply(this, args);
};

Tapable.prototype.applyPluginsAsyncWaterfall = function applyPluginsAsyncWaterfall(name, init, callback) {
	if(!this._plugins[name] || this._plugins[name].length == 0) return callback(null, init);
	var plugins = this._plugins[name];
	var old = this._currentPluginApply;
	this._currentPluginApply = 0;
	var next = function(err, value) {
		if(err) return callback(err);
		this._currentPluginApply++;
		if(this._currentPluginApply >= plugins.length) {
			this._currentPluginApply = old;
			return callback(null, value);
		}
		plugins[this._currentPluginApply].call(this, value, next);
	}.bind(this);
	plugins[0].call(this, init, next);
};

Tapable.prototype.applyPluginsParallel = function applyPluginsParallel(name) {
	var args = Array.prototype.slice.call(arguments, 1);
	var callback = args.pop();
	if(!this._plugins[name] || this._plugins[name].length == 0) return callback();
	var plugins = this._plugins[name];
	var remaining = plugin.length;
	args.push(function(err) {
		if(remaining < 0) return; // ignore
		if(err) {
			remaining = -1;
			return callback(err);
		}
		remaining--;
		if(remaining == 0) {
			return callback();
		}
	});
	for(var i = 0; i < plugins.length; i++) {
		plugins[i].apply(this, args);
	}
};

Tapable.prototype.applyPluginsParallelBailResult = function applyPluginsParallelBailResult(name) {
	var args = Array.prototype.slice.call(arguments, 1);
	var callback = args[args.length-1];
	if(!this._plugins[name] || this._plugins[name].length == 0) return callback();
	var plugins = this._plugins[name];
	var currentPos = plugins.length;
	var currentError, currentResult;
	var done = [];
	for(var i = 0; i < plugins.length; i++) {
		args[args.length-1] = function(i, err, result) {
			if(i >= currentPos) return; // ignore
			done.push(i);
			if(err || result) {
				currentPos = i + 1;
				done = done.filter(function(item) {
					return item <= i;
				});
				currentError = err;
				currentResult = result;
			}
			if(done.length == currentPos) {
				callback(currentError, currentResult);
				currentPos = 0;
			}
		}.bind(this, i);
		plugins[i].apply(this, args);
	}
};


Tapable.prototype.restartApplyPlugins = function restartApplyPlugins() {
	this._currentPluginApply = -1;
};


Tapable.prototype.plugin = function plugin(name, fn) {
	if(!this._plugins[name]) this._plugins[name] = [fn];
	else this._plugins[name].push(fn);
};

Tapable.prototype.apply = function apply() {
	for(var i = 0; i < arguments.length; i++) {
		arguments[i].apply(this);
	}
};