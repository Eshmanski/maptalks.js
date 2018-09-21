import * as maptalks from 'maptalks';
import { toJSON } from '../../../common/Util';

// GeoJSONVectorLayer caches data in memory, should use a dedicated worker.
const dedicatedLayers = ['GeoJSONVectorTileLayer'];

export default class WorkerConnection extends maptalks.worker.Actor {

    constructor(workerKey, layer) {
        super(workerKey);
        const mapId = layer.getMap().id;
        this._layer = layer;
        this._mapId = mapId;
        this._dedicatedVTWorkers = {};
    }

    initialize(cb) {
        cb(null);
    }

    addLayer(cb) {
        const layer = this._layer;
        const options = layer.getWorkerOptions() || {};
        const layerId = layer.getId(), type = layer.getJSONType();
        const data = {
            mapId : this._mapId,
            layerId,
            command : 'addLayer',
            params : {
                type : type,
                options : options
            }
        };
        if (dedicatedLayers.indexOf(type) >= 0) {
            if (!this._dedicatedVTWorkers[layerId]) {
                this._dedicatedVTWorkers[layerId] = this.getDedicatedWorker();
            }
            this.send(data, null, cb, this._dedicatedVTWorkers[layerId]);
        } else {
            this.broadcast(data, null, cb);
        }
    }

    removeLayer(cb) {
        const layerId = this._layer.getId();
        const data = {
            mapId : this._mapId,
            layerId,
            command : 'removeLayer'
        };
        if (this._dedicatedVTWorkers[layerId]) {
            this.send(data, null, cb, this._dedicatedVTWorkers[layerId]);
            delete this._dedicatedVTWorkers[layerId];
        } else {
            this.broadcast(data, null, cb);
        }
    }

    updateStyle(style, cb) {
        const layerId = this._layer.getId();
        const data = {
            mapId : this._mapId,
            layerId,
            command : 'updateStyle',
            params : style
        };
        if (this._dedicatedVTWorkers[layerId]) {
            this.send(data, null, cb, this._dedicatedVTWorkers[layerId]);
        } else {
            this.broadcast(data, null, cb);
        }
    }

    //send(layerId, command, data, buffers, callback, workerId)
    loadTile(context, cb) {
        const layerId = this._layer.getId();
        const data = {
            mapId : this._mapId,
            layerId,
            command : 'loadTile',
            params : {
                tileInfo : toJSON(context.tileInfo),
                glScale : context.glScale,
                zScale : context.zScale
            }
        };
        this.send(data, null, cb, this._dedicatedVTWorkers[layerId]);
    }

    remove() {
        super.remove();
        this._dedicatedVTWorkers = [];
    }

    fetchIconGlyphs(data, cb) {
        //error, data, buffers
        cb(null, { icons : null, glyphs : null }, null);
    }

    _getTileKey(tileInfo) {
        return tileInfo.id;
    }
}
