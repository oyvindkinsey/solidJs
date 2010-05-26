/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global solid, JSON, XMLHttpRequest, ActiveXObject, Sizzle*/

(function(){

    // used when wrapping
    var matches;
    var slice = Array.prototype.slice;
    var emptyFn = Function.prototype;
    function getArgs(args){
        args = slice.call(args);
        args.unshift(matches || [document.body]);
        return args;
    }
    
    /**
     *
     * @param object
     * @param eventName
     */
    function isEventSupported(){
        var args = arguments.length == 2 ? arguments : [matches[0], arguments[0]];
        var object = args[0], eventName = 'on' + args[1];
        object = typeof object === "string" ? document.createElement(object) : object;
        if (eventName in object) {
            return true;
        }
        object.setAttribute(eventName, "return;");
        return typeof object[eventName] == "function";
    }
    
    // Methods for feature testing
    // From http://peter.michaux.ca/articles/feature-detection-state-of-the-art-browser-scripting
    /**
     * @param object
     * @param property
     */
    function isHostMethod(){
        var args = arguments.length == 2 ? arguments : [matches[0], arguments[0]];
        var object = args[0], property = args[1];
        var t = typeof object[property];
        return t == 'function' ||
        (!!(t == 'object' && object[property])) ||
        t == 'unknown';
    }
    /**
     * @param object
     * @param property
     */
    function isHostObject(){
        var args = arguments.length == 2 ? arguments : [matches[0], arguments[0]];
        var object = args[0], property = args[1];
        return !!(typeof(object[property]) == 'object' && object[property]);
    }
    // End from
    
    // From http://javascript.crockford.com/remedial.html
    function getType(value){
        var s = typeof value;
        if (s === 'object') {
            if (value) {
                if (typeof value.length === 'number' &&
                !(value.propertyIsEnumerable('length')) &&
                typeof value.splice === 'function') {
                    s = 'array';
                }
            }
            else {
                s = 'null';
            }
        }
        return s;
    }
    // End from
    
    /**
     * This method ensures that the function is executed on each item in the array provided as the first argument.
     * If the first argument is not an array then it is wrapped in one.
     * @param {Function} fn the function to execute. This should accept an element as the first argument
     * @param {Number} argumentsToExpect The number of arguments that the function expects. If the supplied number is less then [matches] is used as the first one
     * @return {Function} a wrapped function
     */
    function ensureForEach(fn, argumentsToExpect){
        return function(){
            var args = arguments.length === argumentsToExpect ? slice.call(arguments) : getArgs(arguments);
            // At this point we know that the first position is either [matches] or the provided arguments
            if (getType(args[0]) !== "array") {
                args[0] = [args[0]];
            }
            args[0].forEach(function(item, index){
                fn.apply(this, [item].concat(args.slice(1)));
            });
        };
    }
    
    var on = ensureForEach((function(){
        if (isHostMethod(window, "addEventListener")) {
            return function(target, type, listener){
                target.addEventListener(type, listener, false);
            };
        }
        else {
            return function(target, type, listener){
                target.attachEvent("on" + type, false);
            };
        }
    })(), 3);
    
    var un = ensureForEach((function(){
        if (isHostMethod(window, "removeEventListener")) {
            return function(target, type, listener){
                target.removeEventListener(type, listener, false);
            };
        }
        else {
            return function(target, type, listener){
                target.detachEvent("on" + type, listener, false);
            };
        }
    })(), 3);
    
    /**
     * A safe implementation of HTML5 JSON. Feature testing is used to make sure the implementation works.
     * @private
     * @return {JSON} A valid JSON conforming object, or null if not found.
     */
    function getJSON(){
        var cached = {};
        var obj = {
            a: [1, 2, 3]
        }, json = "{\"a\":[1,2,3]}";
        
        if (JSON && typeof JSON.stringify === "function" && JSON.stringify(obj).replace((/\s/g), "") === json) {
            // this is a working JSON instance
            return JSON;
        }
        if (Object.toJSON) {
            if (Object.toJSON(obj).replace((/\s/g), "") === json) {
                // this is a working stringify method
                cached.stringify = Object.toJSON;
            }
        }
        
        if (typeof String.prototype.evalJSON === "function") {
            obj = json.evalJSON();
            if (obj.a && obj.a.length === 3 && obj.a[2] === 3) {
                // this is a working parse method           
                cached.parse = function(str){
                    return str.evalJSON();
                };
            }
        }
        
        if (cached.stringify && cached.parse) {
            // Only memoize the result if we have valid instance
            getJSON = function(){
                return cached;
            };
            return cached;
        }
        return null;
    }
    
    /**
     * Creates a cross-browser XMLHttpRequest object
     * @private
     * @return {XMLHttpRequest} A XMLHttpRequest object.
     */
    var getXhr = (function(){
        if (isHostMethod(window, "XMLHttpRequest")) {
            return function(){
                return new XMLHttpRequest();
            };
        }
        else {
            var item = (function(){
                var list = ["Microsoft", "Msxml2", "Msxml3"], i = list.length;
                while (i--) {
                    try {
                        item = list[i] + ".XMLHTTP";
                        var obj = new ActiveXObject(item);
                        return item;
                    } 
                    catch (e) {
                    }
                }
            }());
            return function(){
                return new ActiveXObject(item);
            };
        }
    }());
    
    function apply(destination, source){
        for (var prop in source) {
            if (source.hasOwnProperty(prop)) {
                destination[prop] = source[prop];
            }
        }
        return destination;
    }
    
    function applyIf(destination, source){
        var member;
        for (var prop in source) {
            if (source.hasOwnProperty(prop)) {
                if (prop in destination) {
                    member = source[prop];
                    if (getType(member) === "object") {
                        applyIf(destination[prop], member);
                    }
                }
                else {
                    destination[prop] = source[prop];
                }
            }
        }
        return destination;
    }
    
    function ajax(config){
        applyIf(config, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Requested-With": "XMLHttpRequest"
            },
            success: emptyFn,
            error: emptyFn,
            data: {},
            type: "plain"
        });
        
        var req = getXhr(), q = [];
        req.open(config.method, config.url, true);
        for (var prop in config.headers) {
            if (config.headers.hasOwnProperty(prop)) {
                req.setRequestHeader(prop, config.headers[prop]);
            }
        }
        
        req.onreadystatechange = function(){
            if (req.readyState == 4) {
                if (req.status >= 200 && req.status < 300) {
                    var response = req.responseText;
                    if (config.type === "json") {
                        response = getJSON().parse(response);
                    }
                    config.success(response);
                }
                else {
                    config.error("An error occured. Status code: " + req.status);
                }
                req.onreadystatechange = null;
                delete req.onreadystatechange;
            }
        };
        
        for (var key in config.data) {
            if (config.data.hasOwnProperty(key)) {
                q.push(encodeURIComponent(key) + "=" + encodeURIComponent(config.data[key]));
            }
        }
        req.send(q.join("&"));
    }
    
    
    /* Export */
    solid = function(selector, context){
        if (typeof selector === "string") {
            matches = Sizzle(selector, context);
        }
        else {
            matches = [selector];
        }
        return solid;
    };
    
    apply(solid, {
        clear: function(){
            matches = [document.body];
        },
        apply: apply,
        on: on,
        un: un,
        isEventSupported: isEventSupported,
        isHostMethod: isHostMethod,
        isHostObject: isHostObject,
        encode: function(obj){
            return getJSON().stringify(obj);
        },
        decode: function(string){
            return getJSON().parse(string);
        },
        apply: apply,
        applyIf: applyIf,
        getXhr: getXhr,
        ajax: ajax
    });
})();
