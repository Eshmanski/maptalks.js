import * as maptalks from 'maptalks';

export default class TerrainWorkerConnection extends maptalks.worker.Actor {
    constructor(mapId) {
        super('@maptalks/terrain');
        this.mapId = mapId;
    }

    fetchTerrain(url, options, cb) {
        const data = {
            actorId: this.actorId,
            mapId: this.mapId,
            command: 'fetchTerrain',
            params: {
                url,
                origin: location.origin,
                terrainWidth: options.terrainWidth,
                type: options.type,
                accessToken: options.accessToken
            }
        };
        this.send(data, null, (err, data) => {
            if (err) {
                cb(err);
                return;
            }
            cb(err, data);
        });
    }

    abortTerrain(url, cb) {
        const data = {
            actorId: this.actorId,
            mapId: this.mapId,
            command: 'abortTerrain',
            params: {
                url
            }
        };
        this.broadcast(data, null, cb);
    }

    addLayer(layerId, options, cb) {
        const data = {
            actorId: this.actorId,
            mapId : this.mapId,
            layerId,
            command : 'addLayer',
            params : {
                options
            }
        };

        this.broadcast(data, null, cb);
    }

    createTerrainMesh(heights, width, cb) {
        const data = {
            actorId: this.actorId,
            command : 'createTerrainMesh',
            params : {
                heights,
                width
            }
        };
        this.send(data, null, (err, data) => {
            if (err) {
                cb(err);
                return;
            }
            cb(err, data);
        });
    }

    removeLayer(layerId, options, cb) {
        const data = {
            mapId : this.mapId,
            layerId,
            command : 'removeLayer'
        };
        this.broadcast(data, null, cb);
    }
}
