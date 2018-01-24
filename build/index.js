"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const react_native_1 = require("react-native");
const react_native_fetch_blob_1 = require("react-native-fetch-blob");
const SHA1 = require("crypto-js/sha1");
const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
const BASE_DIR = react_native_fetch_blob_1.default.fs.dirs.CacheDir + "/react-native-img-cache";
const FILE_PREFIX = react_native_1.Platform.OS === "ios" ? "" : "file://";
class ImageCache {
    constructor() {
        this.cache = {};
    }
    getPath(uri, immutable) {
        let path = uri.substring(uri.lastIndexOf("/"));
        path = path.indexOf("?") === -1 ? path : path.substring(path.lastIndexOf("."), path.indexOf("?"));
        const ext = path.indexOf(".") === -1 ? ".jpg" : path.substring(path.indexOf("."));
        if (immutable === true) {
            return BASE_DIR + "/" + SHA1(uri) + ext;
        }
        else {
            return BASE_DIR + "/" + s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4() + ext;
        }
    }
    static get() {
        if (!ImageCache.instance) {
            ImageCache.instance = new ImageCache();
        }
        return ImageCache.instance;
    }
    clear() {
        this.cache = {};
        return react_native_fetch_blob_1.default.fs.unlink(BASE_DIR);
    }
    on(source, handler, immutable) {
        const { uri } = source;
        if (!this.cache[uri]) {
            this.cache[uri] = {
                source,
                downloading: false,
                handlers: [handler],
                immutable: immutable === true,
                path: immutable === true ? this.getPath(uri, immutable) : undefined
            };
        }
        else {
            this.cache[uri].handlers.push(handler);
        }
        this.get(uri);
    }
    dispose(uri, handler) {
        const cache = this.cache[uri];
        if (cache) {
            cache.handlers.forEach((h, index) => {
                if (h === handler) {
                    cache.handlers.splice(index, 1);
                }
            });
        }
    }
    bust(uri) {
        const cache = this.cache[uri];
        if (cache !== undefined && !cache.immutable) {
            cache.path = undefined;
            this.get(uri);
        }
    }
    cancel(uri) {
        const cache = this.cache[uri];
        if (cache && cache.downloading) {
            cache.task.cancel();
        }
    }
    download(cache) {
        const { source } = cache;
        const { uri } = source;
        if (!cache.downloading) {
            const path = this.getPath(uri, cache.immutable);
            cache.downloading = true;
            const method = source.method ? source.method : "GET";
            cache.task = react_native_fetch_blob_1.default.config({ path }).fetch(method, uri, source.headers);
            cache.task.then(() => {
                cache.downloading = false;
                cache.path = path;
                this.notify(uri);
            }).catch(() => {
                cache.downloading = false;
                // Parts of the image may have been downloaded already, (see https://github.com/wkh237/react-native-fetch-blob/issues/331)
                react_native_fetch_blob_1.default.fs.unlink(path);
            });
        }
    }
    get(uri) {
        const cache = this.cache[uri];
        if (cache.path) {
            // We check here if IOS didn't delete the cache content
            react_native_fetch_blob_1.default.fs.exists(cache.path).then((exists) => {
                if (exists) {
                    this.notify(uri);
                }
                else {
                    this.download(cache);
                }
            });
        }
        else {
            this.download(cache);
        }
    }
    notify(uri) {
        const handlers = this.cache[uri].handlers;
        handlers.forEach(handler => {
            handler(this.cache[uri].path);
        });
    }
}
exports.ImageCache = ImageCache;
class BaseCachedImage extends react_1.Component {
    constructor() {
        super(...arguments);
        this.handler = (path) => {
            this.setState({ path });
        };
    }
    dispose() {
        if (this.uri) {
            ImageCache.get().dispose(this.uri, this.handler);
        }
    }
    observe(source, mutable) {
        if (source.uri !== this.uri) {
            this.dispose();
            this.uri = source.uri;
            ImageCache.get().on(source, this.handler, !mutable);
        }
    }
    getProps() {
        const props = {};
        Object.keys(this.props).forEach(prop => {
            if (prop === "source" && this.props.source.uri) {
                props["source"] = this.state.path ? { uri: FILE_PREFIX + this.state.path } : {};
            }
            else if (["mutable", "component"].indexOf(prop) === -1) {
                props[prop] = this.props[prop];
            }
        });
        return props;
    }
    checkSource(source) {
        if (Array.isArray(source)) {
            throw new Error(`Giving multiple URIs to CachedImage is not yet supported.
            If you want to see this feature supported, please file and issue at
             https://github.com/wcandillon/react-native-img-cache`);
        }
        return source;
    }
    componentWillMount() {
        const { mutable } = this.props;
        const source = this.checkSource(this.props.source);
        this.setState({ path: undefined });
        if (typeof (source) !== "number" && source.uri) {
            this.observe(source, mutable === true);
        }
    }
    componentWillReceiveProps(nextProps) {
        const { mutable } = nextProps;
        const source = this.checkSource(nextProps.source);
        if (typeof (source) !== "number" && source.uri) {
            this.observe(source, mutable === true);
        }
    }
    componentWillUnmount() {
        this.dispose();
    }
}
exports.BaseCachedImage = BaseCachedImage;
class CachedImage extends BaseCachedImage {
    render() {
        const props = this.getProps();
        if (react_1.default.Children.count(this.props.children) > 0) {
            console.warn("Using <CachedImage> with children is deprecated, use <CachedImageBackground> instead.");
        }
        return react_1.default.createElement(react_native_1.Image, Object.assign({}, props), this.props.children);
    }
}
exports.CachedImage = CachedImage;
class CachedImageBackground extends BaseCachedImage {
    render() {
        const props = this.getProps();
        return react_1.default.createElement(react_native_1.ImageBackground, Object.assign({}, props), this.props.children);
    }
}
exports.CachedImageBackground = CachedImageBackground;
class CustomCachedImage extends BaseCachedImage {
    render() {
        const { component } = this.props;
        const props = this.getProps();
        const Component = component;
        return react_1.default.createElement(Component, Object.assign({}, props), this.props.children);
    }
}
exports.CustomCachedImage = CustomCachedImage;
//# sourceMappingURL=index.js.map