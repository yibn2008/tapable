/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
function Tapable() {
	this._plugins = {};
}
module.exports = Tapable;

function copyProperties(from, to) {
	for(var key in from)
		to[key] = from[key];
	return to;
}

Tapable.mixin = function mixinTapable(pt) {
	copyProperties(Tapable.prototype, pt);
}

// 给定一个插件名称, 依次调用这个名称下绑定的所有插件, 并传入当然调用的参数
// 
// 此方法在递归调用时, this._currentPluginApply 属性会根据上下文而改变, 最终
// 在递归调用完成时, 此属性又会还原, 下同
Tapable.prototype.applyPlugins = function applyPlugins(name) {
	if(!this._plugins[name]) return;
	var args = Array.prototype.slice.call(arguments, 1);
	var plugins = this._plugins[name];
	// 保留现场
	var old = this._currentPluginApply;
	for(this._currentPluginApply = 0; this._currentPluginApply < plugins.length; this._currentPluginApply++)
		plugins[this._currentPluginApply].apply(this, args);
	// 还原现场
	this._currentPluginApply = old;
};

// Waterfall: 每一个插件调用时的返回值, 会与当前调用参数一起, 作为下一次插件调用的参数, 并返回最后的返回值
Tapable.prototype.applyPluginsWaterfall = function applyPlugins(name, init) {
	if(!this._plugins[name]) return init;
	var args = Array.prototype.slice.call(arguments, 2);
	var plugins = this._plugins[name];
	var current = init;
	var old = this._currentPluginApply;
	for(this._currentPluginApply = 0; this._currentPluginApply < plugins.length; this._currentPluginApply++)
		current = plugins[this._currentPluginApply].apply(this, [current].concat(args));
	this._currentPluginApply = old;
	return current;
};

// BailResult: 如果一个插件有返回值, 就返回此值, 不再进入下一个插件
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

// AsyncSeries: 包装callback, 支持插件的异步顺序调用, 如果出错或插件调用完成, 就调用最初的callback
Tapable.prototype.applyPluginsAsyncSeries = Tapable.prototype.applyPluginsAsync = function applyPluginsAsync(name) {
	var args = Array.prototype.slice.call(arguments, 1);
	var callback = args.pop();
	if(!this._plugins[name] || this._plugins[name].length == 0) return callback();
	var plugins = this._plugins[name];
	var i = 0;
	args.push(copyProperties(callback, function next(err) {
		if(err) return callback(err);
		i++;
		if(i >= plugins.length) {
			return callback();
		}
		plugins[i].apply(this, args);
	}.bind(this)));
	plugins[0].apply(this, args);
};

// AsyncWaterfall: ???
Tapable.prototype.applyPluginsAsyncWaterfall = function applyPluginsAsyncWaterfall(name, init, callback) {
	if(!this._plugins[name] || this._plugins[name].length == 0) return callback(null, init);
	var plugins = this._plugins[name];
	var i = 0;
	var next = copyProperties(callback, function(err, value) {
		if(err) return callback(err);
		i++;
		if(i >= plugins.length) {
			return callback(null, value);
		}
		plugins[i].call(this, value, next);
	}.bind(this));
	plugins[0].call(this, init, next);
};

// Parallel: 并行执行异步插件, 如果出错或者全部执行完毕, 就调用callback
Tapable.prototype.applyPluginsParallel = function applyPluginsParallel(name) {
	var args = Array.prototype.slice.call(arguments, 1);
	var callback = args.pop();
	if(!this._plugins[name] || this._plugins[name].length == 0) return callback();
	var plugins = this._plugins[name];
	var remaining = plugins.length;
	args.push(copyProperties(callback, function(err) {
		if(remaining < 0) return; // ignore
		if(err) {
			remaining = -1;
			return callback(err);
		}
		remaining--;
		if(remaining == 0) {
			return callback();
		}
	}));
	for(var i = 0; i < plugins.length; i++) {
		plugins[i].apply(this, args);
		if(remaining < 0) return;
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
		args[args.length-1] = (function(i) {
			return copyProperties(callback, function(err, result) {
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
			});
		}(i));
		plugins[i].apply(this, args);
	}
};


Tapable.prototype.restartApplyPlugins = function restartApplyPlugins() {
	if(typeof this._currentPluginApply !== "number")
		throw new Error("Tapable.prototype.restartApplyPlugins can only be used inside of any sync plugins application");
	this._currentPluginApply = -1;
};


Tapable.prototype.plugin = function plugin(name, fn) {
	if(Array.isArray(name)) {
		name.forEach(function(name) {
			this.plugin(name, fn);
		}, this);
		return;
	}
	if(!this._plugins[name]) this._plugins[name] = [fn];
	else this._plugins[name].push(fn);
};

Tapable.prototype.apply = function apply() {
	for(var i = 0; i < arguments.length; i++) {
		arguments[i].apply(this);
	}
};
