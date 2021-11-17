import { isString, extend } from '../../common/Util';
import Ajax from '../util/Ajax';
import { log2 } from '../../common/Util';
import geojsonvt from 'geojson-vt';
import BaseLayerWorker from './BaseLayerWorker';
import bbox from 'geojson-bbox';

export default class GeoJSONLayerWorker extends BaseLayerWorker {
    /**
     *
     * @param {String} id - id
     * @param {Object} options - options
     * @param {Object} options.geojsonvt - options of geojsonvt
     * @param {Object} [options.headers=null]  - headers of http request for remote geojson
     * @param {Object} [options.jsonp=false]   - use jsonp to fetch remote geojson
     * @param {*} uploader
     * @param {*} cb
     */
    constructor(id, options, uploader, cache, loadings, cb) {
        super(id, options, uploader, cache, loadings);
        options = options || {};
        if (!options.extent) {
            options.extent = 8192;
        }
        this.zoomOffset = 0;
        if (options.tileSize) {
            //for different tile size, set a zoom offset for geojson-vt
            //https://github.com/mapbox/geojson-vt/issues/35
            this.zoomOffset = -log2(options.tileSize[0] / 256);
        }
        this.setData(options.data, cb);
    }

    /**
     * Set data
     * @param {Object} data
     * @param {Function} cb  - callback function when finished
     */
    setData(data, cb) {
        delete this.index;
        if (!data) {
            cb();
            return;
        }
        const options = {
            maxZoom: 24,  // max zoom to preserve detail on; can't be higher than 24
            tolerance: this.options.extent / this.options.tileSize[0] * 1, // simplification tolerance (higher means simpler)
            extent: this.options.extent, // tile extent (both width and height)
            buffer: this.options.tileBuffer || 64,      // tile buffer on each side
            debug: 0,      // logging level (0 to disable, 1 or 2)
            lineMetrics: true,
            indexMaxZoom: 5,       // max zoom in the initial tile index
            indexMaxPoints: 100000 // max number of points per tile in the index
        };
        if (isString(data) && data.substring(0, 1) != '{') {
            Ajax.getJSON(data, this.options, (err, resp) => {
                if (err) cb(err);
                const data = resp;
                const { first1000, idMap } = this._generateId(data);
                this.index = geojsonvt(resp, this.options.geojsonvt || options);
                const extent = bbox(first1000);
                cb(null, { extent, idMap });
            });
        } else {
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }
            const features = Array.isArray(data) ? data : data.features;
            let first1000 = features;
            if (features.length > 1000) {
                first1000 = features.slice(0, 1000);
            }
            const extent = bbox({ type: "FeatureCollection", features: first1000 });
            this.index = geojsonvt(data, this.options.geojsonvt || options);
            cb(null, { extent });
        }
    }

    _generateId(data) {
        // generate id
        const first1000 = [];
        const idMap = {};
        let uid = 0;

        function visit(f) {
            if (!f) {
                return;
            }
            if (f.id === undefined || f.id === null) {
                f.id = uid++;
            }
            idMap[f.id] = extend({}, f);
            if (f.geometry) {
                idMap[f.id].geometry = extend({}, f.geometry);
                idMap[f.id].geometry.coordinates = null;
            } else if (f.coordinates) {
                idMap[f.id].coordinates = null;
            }

            if (first1000.length < 1000) {
                first1000.push(f);
            }
        }
        if (Array.isArray(data)) {
            data.forEach(f => {
                visit(f);
            });
        } else if (data.features) {
            data.features.forEach(f => {
                visit(f);
            });
        }
        return { first1000: { type: "FeatureCollection", features: first1000 }, idMap };
    }

    getTileFeatures(tileInfo, cb) {
        const features = [];
        if (!this.index) {
            setTimeout(function () {
                cb({ loading: true });
            }, 1);
            return 1;
        }
        const tile = this.index.getTile(tileInfo.z + this.zoomOffset, tileInfo.x, tileInfo.y);
        if (!tile || tile.features.length === 0) {
            setTimeout(function () {
                cb(null, features, []);
            }, 1);
            return 1;
        }
        const layers = [];

        for (let i = 0, l = tile.features.length; i < l; i++) {
            const feature = tile.features[i];

            let layerId = feature.layer;
            if (layerId === undefined) {
                layerId = '0';
            }
            layers[layerId] = {
                types: {}
            };
            const types = layers[layerId].types;
            types[feature.type] = 1;
            feature.tags = feature.tags || {};
            // feature.tags['$layer'] = layerId;
            // feature.tags['$type'] = feature.type;
            features.push({
                type: feature.type,
                layer: layerId,
                id: feature.id,
                geometry: feature.geometry,
                properties: feature.tags,
                extent: this.options.extent
            });
        }

        for (const p in layers) {
            layers[p].types = Object.keys(layers[p].types).map(t => +t);
        }

        //TODO 增加geojson-vt的多图层支持
        setTimeout(function () {
            cb(null, features, layers);
        }, 1);

        return 1;
    }

    onRemove() {
        delete this.index;
    }
}
