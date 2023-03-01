var map;

const mapTilerToken = 'https://api.maptiler.com/maps/topo/{z}/{x}/{y}.png?key=90RVzabwVf6oCi81Oo0m';
const mapTilerAttribution = '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>';
const serverBaseUrl = 'http://192.168.0.15:8085/geoserver/serbia';
const serbiaNamespace = 'http://192.168.0.15:8080/geoserver/serbia';
const layer = {
    point: 'serbia:planet_osm_point',
    point4326: 'serbia:planet_osm_point_new',
    datapoint: 'serbia:planet_osm_datapoint',
    roads: 'serbia:planet_osm_roads',
    polygon: 'serbia:planet_osm_polygon',
    polygon4326: 'serbia:planet_osm_polygon_new',
    line: 'serbia:planet_osm_line_new',
    pointLine: 'serbia:SerbiaMap'
}
const displayLayers = {
    locations: null,
    roads: null,
    trafficForVehicle: null,
    lines: null
}

var universities;
var cities;
var areas;
var andjelas;

var layerControls;

var isInsertMode = false;
var isExploreMode = false;
var isJamTrackerMode = false;
var isDowFilterOn = false;


var pointClickedEvent = null;

var showTrafficForVehicle = false;

var highwayControls = {};
var amenityControls = {};
var jammerControls = {};
var cityRoadsControls = {};
var cityAreas = {};
var publicTransportContols = {};
var publicTransportLines = new Map();
var busStopsLayer = {};
var dowFilter = 'all';
var jammerControl = null;

var jammerFilters = {
    hour: 'morning',
    speed: 'low',
    dow: 'all'
}

var draggableMarkerForInsert = null;
var dropMarker = null;

var searchQuery = null;

var showTrafficJamLayer = false;

var rangeDates = {
    min: new Date('2012-10-01'),
    max: new Date('2014-11-01')
}
var datesSelected = {
    min: new Date('2013-01-01'),
    max: new Date('2014-01-01')
}
$(function () {
    $("#slider-range").slider({
        range: true,
        min: rangeDates.min.getTime() / 1000,
        max: rangeDates.max.getTime() / 1000,
        step: 86400 * 2,
        values: [datesSelected.min.getTime() / 1000, datesSelected.max.getTime() / 1000],
        slide: function (event, ui) {
            datesSelected.min = new Date($("#slider-range").slider("values", 0) * 1000);
            datesSelected.max = new Date($("#slider-range").slider("values", 1) * 1000);
            $("#amount").val((datesSelected.min.toDateString()) +
                " - " + (datesSelected.max).toDateString());

            displayLayers.trafficForVehicle.setParams({ CQL_FILTER: "dtime AFTER " + datesSelected.min.toISOString() + ' AND dtime BEFORE ' + datesSelected.max.toISOString() });
        }
    });
    $("#amount").val((datesSelected.min.toDateString()) +
        " - " + (datesSelected.max).toDateString());
});

//const
function setupView() {
    map = initMap();

    // Initialise the FeatureGroup to store editable layers

    addControls();
    createDropMarker();
}

function toggleInsertMode() {
    isInsertMode = !isInsertMode;
    if (isInsertMode == true) {
        document.getElementById("insertToggle").innerHTML = "Insert mode on. Click on spot to add it to the map";
        document.getElementById("insertToggle").innerText = "Insert mode on. Click on spot to add it to the map";
        document.getElementById('insert-form').style.display = 'block';
    } else {
        document.getElementById("insertToggle").innerHTML = "Click on spot to get info";
        document.getElementById("insertToggle").innerText = "Click on spot to get info";
        document.getElementById('insert-form').style.display = 'none';
        if (draggableMarkerForInsert) {
            map.removeLayer(draggableMarkerForInsert);
        }
    }
}

function toggleExploreMode() {
    isExploreMode = !isExploreMode;
    if (isExploreMode) {
        dropMarker.dragging.enable();
        L.DomUtil.addClass(dropMarker._icon, 'blinking');
        document.getElementById('explore-mode-options').style.display = 'block';
    } else {
        setDropMarkerPosition();
        dropMarker.dragging.disable();
        document.getElementById('explore-mode-options').style.display = 'none';
    }
}

function toggleJamTrackerMode() {
    isJamTrackerMode = !isJamTrackerMode;
    if (isJamTrackerMode) {
        document.getElementById('jam-tracker').style.display = 'block';
        document.getElementById('traffic-range-slider').style.display = 'block';
    } else {
        document.getElementById('jam-tracker').style.display = 'none';
        document.getElementById('traffic-range-slider').style.display = 'none';
        removeJammerControl();
        removeAllLayersFromGroup(publicTransportContols);
        removeAllLayersFromGroup(cityRoadsControls);
    }
}

function onSearchInputChange() {
    searchQuery = document.getElementById('amenity-search-input').value.toLowerCase();
    checkAndUpdateLayers();

}

function checkAndUpdateLayers() {
    if (searchQuery && searchQuery.length >= 3) {
        updateAllAmenityLayers();
    } else {
        removeAllAmenityLayers();
    }
}

function onMapClicked(e) {
    if (isInsertMode) {
        pointClickedEvent = e;
        if (draggableMarkerForInsert) {
            map.removeLayer(draggableMarkerForInsert);
        }
        draggableMarkerForInsert = L.marker(pointClickedEvent.latlng, { icon: icons['new'], draggable: true }).addTo(map);
    } else {
        if (draggableMarkerForInsert) {
            map.removeLayer(draggableMarkerForInsert);
            draggableMarkerForInsert = null;
        }
        getFeatureInfo(e);
    }
}

function getFeatureInfo(e) {
    var sw = map.getBounds().getSouthWest();
    var ne = map.getBounds().getNorthEast();
    var BBOX = sw.lat + "," + sw.lng + "," + ne.lat + "," + ne.lng;
    var WIDTH = map.getSize().x;
    var HEIGHT = map.getSize().y;

    var X = Math.trunc(map.layerPointToContainerPoint(e.layerPoint).x);
    var Y = Math.trunc(map.layerPointToContainerPoint(e.layerPoint).y);

    var URL = `${serverBaseUrl}/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${layer.point4326}&QUERY_LAYERS=${layer.point4326}&BBOX=`
        + `${BBOX}&FEATURE_COUNT=1&HEIGHT=${HEIGHT}&WIDTH=${WIDTH}&INFO_FORMAT=application/json&TILED=false&CRS=EPSG:4326&I=${X}&J=${Y}`;

    sendApiRequest(URL, e.latlng, presentFeaturePopup);
}

function getBBoxCoordinates() {
    var sw = map.getBounds().getSouthWest();
    var ne = map.getBounds().getNorthEast();
    return sw.lng + "," + sw.lat + "," + ne.lng + "," + ne.lat;
}

function getFullBBoxCoordinates() {
    var sw = map.getBounds().getSouthWest();
    var ne = map.getBounds().getNorthEast();
    var nw = map.getBounds().getNorthWest();
    var se = map.getBounds().getSouthEast();
    return sw.lat + " " + sw.lng + "," + se.lat + " " + se.lng + "," + ne.lat + " " + ne.lng + "," + nw.lat + " " + nw.lng + "," + sw.lat + " " + sw.lng;
}

function initMap() {
    let map = L.map('map')
        .setView([43.325, 21.911], 14);
    L.tileLayer(mapTilerToken, {
        attribution: mapTilerAttribution,
        maxZoom: 18,
        id: 'mapbox/streets-v11',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: 'your.mapbox.access.token'
    }).addTo(map);
    map.on('click', onMapClicked);
    map.on('overlayadd', onOverlayAdd);
    map.on('overlayremove', onOverlayRemove);
    map.on('dragend', setDropMarkerPosition);
    map.on(L.Draw.Event.CREATED, function (e) {
        console.log(e);
        var type = e.layerType,
            layer = e.layer;
        if (type === 'marker') {
            // Do marker specific actions
        }
        // Do whatever else you need to. (save to db; add to map etc)
        map.addLayer(layer);
    });
    return map;
}

function createDropMarker() {
    dropMarker = new L.marker(getDropMarkerPosition(), { icon: icons['person'], draggable: true }).addTo(map);
    dropMarker.dragging.disable();

    dropMarker.on('drag', function (e) {
        console.log('marker drag event');
    });
    dropMarker.on('dragstart', function (e) {
        console.log('marker dragstart event');
        L.DomUtil.removeClass(dropMarker._icon, 'blinking');
    });
    dropMarker.on('dragend', function (e) {
        console.log('marker dragend event');
        updateAllAmenityLayers();
    });

    dropMarker.addTo(map);
}

function setDropMarkerPosition() {
    if (dropMarker && !isExploreMode) {
        dropMarker.setLatLng(getDropMarkerPosition());
    }
}

function getDropMarkerPosition() {
    const mapBounds = map.getBounds();

    const x = mapBounds.getSouthEast();
    const p = map.latLngToContainerPoint(x);
    const p_WithOffset = p.subtract(L.point(70, 70));
    const x_WithOffset = map.containerPointToLatLng(p_WithOffset);
    return x_WithOffset;
}

function onOverlayAdd(e) {
    if (e.name === 'Traffic') {
        showTrafficForVehicle = true;
        document.getElementById('traffic-range-slider').style.display = 'block';
    }
}

function onOverlayRemove(e) {
    if (e.name === 'Traffic') {
        showTrafficForVehicle = false;
        document.getElementById('traffic-range-slider').style.display = 'none';
    }
}

var MyCustomMarker = L.Icon.extend({
    options: {
        shadowUrl: null,
        iconAnchor: new L.Point(12, 12),
        iconSize: new L.Point(24, 24),
        iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/Information_icon4_orange.svg'
    }
});

function addControls() {
    var editableLayers = new L.FeatureGroup();
    map.addLayer(editableLayers);
    displayLayers.locations = L.tileLayer.wms(serverBaseUrl + '/wms', {
        layers: layer.point,
        format: 'image/png',
        transparent: true
    });
    displayLayers.roads = L.tileLayer.wms(serverBaseUrl + '/wms', {
        layers: layer.roads,
        format: 'image/png',
        transparent: true
    });
    displayLayers.lines = L.tileLayer.wms(serverBaseUrl + '/wms', {
        layers: layer.line,
        format: 'image/png',
        transparent: true
    });
    displayLayers.trafficForVehicle = L.tileLayer.wms(serverBaseUrl + '/wms', {
        layers: layer.datapoint,
        format: 'image/png',
        transparent: true
    })
    var basemaps = {
        Locations: displayLayers.locations,
        Roads: displayLayers.roads,
        Traffic: displayLayers.trafficForVehicle,
        Lines: displayLayers.lines
    };
    layerControls = L.control.layers({}, basemaps, { collapsed: true, autoZIndex: false }).addTo(map);
    if (basemaps.Topography) {
        basemaps.Topography.addTo(map);
    }
    displayLayers.trafficForVehicle.setParams({ CQL_FILTER: "dtime AFTER " + datesSelected.min.toISOString() + ' AND dtime BEFORE ' + datesSelected.max.toISOString() });
}

function showJammerLayer() {
    showTrafficJamLayer = true;
    updateSpeedHourLayer(jammerFilters['speed'], jammerFilters['hour'], dowFilter);
    document.getElementById('jammer-clear').classList.remove('element-hide');
    document.getElementById('jammer-show').classList.add('element-hide');
}

function addTraficFeatureLayer(highwayType, forceSelect) {
    if (highwayControls[highwayType]) {
        map.removeLayer(highwayControls[highwayType]);
        highwayControls[highwayType] = null;
        document.getElementById('highway-' + highwayType.replaceAll('_', '')).style.backgroundColor = 'bisque';
        if (!forceSelect) {
            return;
        }
    }
    document.getElementById('highway-' + highwayType.replaceAll('_', '')).style.backgroundColor = 'coral';
    let apiUrl = `${serverBaseUrl}/wfs?service=wfs&version=1.1.0&request=GetFeature&typename=${layer.point4326}
                &outputformat=json&cql_filter=highway='${highwayType}'&CRS=EPSG:4326`;
    sendApiRequest(apiUrl, null, function (data) {
        if (data && data.features) {
            var highways = data.features.map(feature =>
                markFeature([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], getFeatureDescription(feature.properties), highwayType)
            );
            let highwayGroup = L.layerGroup(highways);
            highwayControls[highwayType] = highwayGroup;
            highwayGroup.addTo(map);
        }
    })

}

function onRangeChange() {
    const rangeEl = document.getElementById('cover-range').value;
    document.getElementById('range-value').innerText = rangeEl / 1000;
    updateAllAmenityLayers();
}

function addAmenityLayer(amenityType) {
    const range = document.getElementById('cover-range').value;
    if (amenityControls[amenityType]) {
        map.removeLayer(amenityControls[amenityType]);
        amenityControls[amenityType] = null;
        document.getElementById('amenity-' + amenityType.replaceAll('_', '')).classList.remove("amenity-tag--selected");
        updateAllAmenityLayers();
    } else {
        document.getElementById('amenity-' + amenityType.replaceAll('_', '')).classList.add("amenity-tag--selected");
        if (amenityControls['search'] != null) {
            map.removeLayer(amenityControls['search']);
            amenityControls['search'] = null;
        }
        updateAmenityLayer(amenityType);
    }
}

function updateAmenityLayer(amenityType) {
    const range = document.getElementById('cover-range').value;
    let searchQueryFilter = searchQuery && searchQuery.length >= 3 ? `strToLowerCase(name) like '%25${searchQuery}%25' AND ` : '';
    let amenityFilter = amenityType ? `amenity='${amenityType}' and ` : '';
    let apiUrl = `${serverBaseUrl}/wfs?service=wfs&version=1.1.0&request=GetFeature&typename=${layer.point4326}&outputformat=json&cql_filter=${searchQueryFilter}${amenityFilter}dwithin(way, Point(${dropMarker.getLatLng().lat} ${dropMarker.getLatLng().lng}), ${range}, meters)&CRS=EPSG:4326`;
    sendApiRequest(apiUrl, null, function (data) {
        if (data && data.features) {
            var amenities = data.features.map(feature =>
                markFeature([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], getFeatureDescription(feature.properties), feature.properties.amenity)
            );
            let amenityGroup = L.layerGroup(amenities);
            amenityControls[amenityType ? amenityType : 'search'] = amenityGroup;
            amenityGroup.addTo(map);
        }
    })

}

function updateAllAmenityLayers() {
    let amenityTypes = Object.keys(amenityControls).filter(v => amenityControls[v] != null && v != 'search');
    if (amenityTypes.length > 0) {
        amenityTypes.forEach(amenityType => {
            if (amenityControls[amenityType] != null) {
                map.removeLayer(amenityControls[amenityType]);
                amenityControls[amenityType] = null;
            }
            updateAmenityLayer(amenityType);
        });
    } else {
        if (amenityControls['search'] != null) {
            map.removeLayer(amenityControls['search']);
            amenityControls['search'] = null;
        }
        if (searchQuery && searchQuery.length >= 3) {
            updateAmenityLayer(null);
        }
    }
}

function removeAllAmenityLayers() {
    let amenityTypes = Object.keys(amenityControls).filter(v => amenityControls[v] != null);
    if (amenityTypes && amenityTypes.length > 0) {
        amenityTypes.forEach(amenityType => {
            if (amenityControls[amenityType] != null) {
                map.removeLayer(amenityControls[amenityType]);
                amenityControls[amenityType] = null;
            }
        });
    }
}

function removeAllLayersFromGroup(layerGroup) {
    let layers = Object.keys(layerGroup).filter(v => layerGroup[v] != null);
    if (layers && layers.length > 0) {
        layers.forEach(layer => {
            if (layerGroup[layer] != null) {
                map.removeLayer(layerGroup[layer]);
                layerGroup[layer] = null;
                delete layerGroup[layer];
            }
        });
    }
}


function getFeatureDescription(featureProperties) {
    return description = Object.entries(featureProperties)
        .filter(([name, value]) => value !== null)
        .reduce(function (acc, [name, value]) {
            return acc + ' ' + name + ': ' + value + '<br>';
        }, '');
}

function onJammerFilterClicked(type, value) {
    if (type === 'dow') {
        if (document.getElementById('jammer-' + dowFilter.toLowerCase())) {
            document.getElementById('jammer-' + dowFilter.toLowerCase()).classList.remove("dow-tag--selected");
        }
        dowFilter = document.querySelector(`input[name="dow-filter"]:checked`).value;
        document.getElementById('jammer-' + dowFilter.toLowerCase()).classList.add("dow-tag--selected");
    } else {
        jammerFilters[type] = value;
    }
    if (showTrafficJamLayer) {
        updateSpeedHourLayer(jammerFilters['speed'], jammerFilters['hour'], dowFilter);
    }
}
function removeJammerControl() {
    if (jammerControl) {
        map.removeLayer(jammerControl);
        jammerControl = null;
    }
}
function toggleDowFilter() {
    isDowFilterOn = !isDowFilterOn;
    if (isDowFilterOn) {
        document.getElementById('dow-container').classList.remove("div-disabled");
        dowFilter = document.querySelector(`input[name="dow-filter"]:checked`).value;
        document.getElementById('jammer-' + dowFilter.toLowerCase()).classList.add("dow-tag--selected");
        if (showTrafficJamLayer) {
            updateSpeedHourLayer(jammerFilters['speed'], jammerFilters['hour'], dowFilter)
        }
    } else {
        document.getElementById('dow-container').classList.add("div-disabled");
        dowFilter = 'all';
        updateSpeedHourLayer(jammerFilters['speed'], jammerFilters['hour'], dowFilter);
    }
}

function updateSpeedHourLayer(speed, hour, dow) {
    removeJammerControl();
    updateJammerLayer(`'bbox(way, ${getBBoxCoordinates()}) AND ${getHourCqlFilter(hour, dow)} AND ${getSpeedCqlFilter(speed)}'`, dowFilter);
}

function updateJammerLayer(filterValue, timePeriod) {
    let filter = `dwithin(way, collectGeometries(queryCollection('serbia:planet_osm_datapoint', 'way', ${filterValue})), 1, meters)`;
    let apiUrl = `${serverBaseUrl}/wfs?service=wfs&version=1.1.0&request=GetFeature&typename=${layer.line}&outputformat=json&cql_filter=${filter}&CRS=EPSG:4326&propertyName=`;
    sendApiRequest(apiUrl, null, function (data) {
        if (data && data.features) {
            var amenities = data.features.map(feature =>
                drawLineOnMap(feature.geometry.coordinates.map(el => [el[1], el[0]]), timePeriod, 'line', `${dowFilter}-${jammerFilters.hour}-${jammerFilters.speed}`)
            );
            let amenityGroup = L.layerGroup(amenities);
            jammerControl = amenityGroup;
            amenityGroup.addTo(map);
        }
    })
}

function getSpeedCqlFilter(speedType) {
    switch (speedType) {
        case 'moderate':
            return `speed BETWEEN 30 AND 70`
        case 'fast':
            return `speed BETWEEN 71 AND 130`
        case 'overlimit':
            return `speed > 130`
        case 'slow':
        default:
            return `speed < 30`;
    }
}

function getHourCqlFilter(period, dow) {
    let minHour = 0;
    let maxHour = 0;
    switch (period) {
        case 'morning':
            minHour = '07';
            maxHour = 11;
            break;
        case 'noon':
            minHour = 12;
            maxHour = 14;
            break;
        case 'afternoon':
            minHour = 15;
            maxHour = 18;
            break;
        case 'evening':
            minHour = 19;
            maxHour = 23;
            break;
        case 'night':
            minHour = '00';
            maxHour = '06';
    }

    return `dtime AFTER ${datesSelected.min.toISOString()} AND dtime BEFORE ${datesSelected.max.toISOString()} and (dateFormat(''HH'',dtime)) >= ''${minHour}'' AND (dateFormat(''HH'',dtime)) <= ''${maxHour}'' ` + (dow !== 'all' ? `AND (dateFormat(''EEE'',dtime))==''${dow}''` : ``);
}

function removeAllJammerLayers() {
    let jammerTypes = Object.keys(jammerControls).filter(v => jammerControls[v] != null);
    if (jammerTypes && jammerTypes.length > 0) {
        jammerTypes.forEach(jammerTypes => {
            if (jammerControls[jammerTypes] != null) {
                map.removeLayer(jammerControls[jammerTypes]);
                jammerControls[jammerTypes] = null;
            }
        });
    }
}

function drawLineOnMap(pointList, featureType, geometryType, name, useRandom) {
    let l;
    if (geometryType == 'Polygon') {
        l = new L.polygon(pointList, {
            color: 'red',
            weight: 2,
            opacity: 0.3,
            smoothFactor: 1,
        });
    } else {
        l = new L.polyline(pointList, {
            color: getJammerColor(featureType, useRandom),
            weight: 3,
            opacity: 1,
            smoothFactor: 1
        })
    }
    if (name != null) {
        l.bindTooltip(`${name}`).openTooltip();
    }

    return l;
}

function getJammerColor(type, useRandom) {
    switch (type) {
        case 'Mon':
            return 'red';
        case 'Tue':
            return 'blue';
        case 'Wed':
            return 'green';
        case 'Thu':
            return 'orange';
        case 'Fri':
            return 'yellow';
        case 'Sat':
            return 'violet';
        case 'Sun':
            return 'lightyellow';
        default:
            return useRandom ? '#' + Math.floor(Math.random() * 16777215).toString(16) : '#91188d';
    }
}

function onCityRoadsClicked(roadType) {
    let checkedOption = document.querySelector(`input[id="${roadType}-road"]:checked`);
    if (checkedOption) {
        if (cityRoadsControls[roadType] != null) {
            map.removeLayer(cityRoadsControls[roadType]);
            cityRoadsControls[roadType] = null;
        }
        updateCityRoadsLayerWithPolygon(roadType);
    } else {
        if (cityRoadsControls[roadType] != null) {
            map.removeLayer(cityRoadsControls[roadType]);
            cityRoadsControls[roadType] = null;
        }
    }
}

function updateCityRoadsLayer(roadType) {
    let filterValue = `'place = ''city'' AND bbox(way, ${getBBoxCoordinates()})'`;
    let filter = `highway='${roadType}' AND intersects(way, collectGeometries(queryCollection('serbia:planet_osm_polygon_new', 'way', ${filterValue})))`;
    let apiUrl = `${serverBaseUrl}/wfs?service=wfs&version=1.1.0&request=GetFeature&typename=${layer.line}&outputformat=json&cql_filter=${filter}&CRS=EPSG:4326&propertyName=`;
    sendApiRequest(apiUrl, null, function (data) {
        if (data && data.features) {
            var amenities = data.features.map(feature =>
                drawLineOnMap(feature.geometry.coordinates.map(el => [el[1], el[0]]), roadType)
            );
            let amenityGroup = L.layerGroup(amenities);
            amenityGroup.setText(roadType);
            cityRoadsControls[roadType] = amenityGroup;
            amenityGroup.addTo(map);
        }
    })
}

function updateCityRoadsLayerWithPolygon(roadType) {
    let filterValue = `'place = ''city'' AND bbox(way, ${getBBoxCoordinates()})'`;
    let filter = `highway='${roadType}' AND intersects(way, collectGeometries(queryCollection('serbia:planet_osm_polygon_new', 'way', ${filterValue}))); place='city' AND intersects(way, POLYGON((${getFullBBoxCoordinates()})))`;
    let apiUrl = `${serverBaseUrl}/wfs?service=wfs&version=1.1.0&request=GetFeature&typenames=(${layer.line})(${layer.polygon4326})&outputformat=json&cql_filter=${filter}&CRS=EPSG:4326&propertyName=`;
    sendApiRequest(apiUrl, null, function (data) {
        if (data && data.features) {
            var amenities = data.features.reverse().map(feature =>
                drawLineOnMap(feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0].map(el => [el[1], el[0]]) : feature.geometry.coordinates.map(el => [el[1], el[0]]), roadType, feature.geometry.type, feature.properties.name)
            );
            let amenityGroup = L.layerGroup(amenities);
            cityRoadsControls[roadType] = amenityGroup;
            amenityGroup.addTo(map);
        }
    })
}

function onPublicTransportClicked(type) {
    let checkedOption = document.querySelector(`input[id="${type}-line"]:checked`) ? document.querySelector(`input[id="${type}-line"]:checked`).value : null;
    if (checkedOption) {
        if (checkedOption != 'bus') {
            publicTransportLines.clear();
            removeBusStops();
            document.getElementById('select-bus-line').style.display = 'none';
        } else {
            document.getElementById('select-bus-line').style.display = 'block'
        }
        if (publicTransportContols[type] != null) {
            map.removeLayer(publicTransportContols[type]);
            publicTransportContols[type] = null;
        }
        updatePublicTransportLayer(type);
    } else {
        if (publicTransportContols[type] != null) {
            map.removeLayer(publicTransportContols[type]);
            publicTransportContols[type] = null;
        }
        if (type == 'bus') {
            removeBusStops();
            document.getElementById('select-bus-line').style.display = 'none';
        }
        publicTransportLines.clear();
        document.getElementById('select-bus-line').style.display = 'none';
    }
    document.getElementById(`public-transport-text-${type}`).classList.toggle('public-transport-option--selected');
}

function updatePublicTransportLayer(type) {
    let filterValue = `'place = ''city'' AND bbox(way, ${getBBoxCoordinates()})'`;
    let filter = `route='${type}' AND intersects(way, collectGeometries(queryCollection('serbia:planet_osm_polygon_new', 'way', ${filterValue})))`;
    let apiUrl = `${serverBaseUrl}/wfs?service=wfs&version=1.1.0&request=GetFeature&typenames=(${layer.line})&outputformat=json&cql_filter=${filter}&CRS=EPSG:4326&propertyName=`;
    sendApiRequest(apiUrl, null, function (data) {
        if (data && data.features) {
            var amenities = data.features.map(feature => {
                if (type == 'bus') {
                    publicTransportLines.set(feature.properties.ref, feature.properties.name);
                }
                return drawLineOnMap(feature.geometry.coordinates.map(el => [el[1], el[0]]), type, feature.geometry.type, feature.properties.name, true)
            });
            let amenityGroup = L.layerGroup(amenities);
            publicTransportContols[type] = amenityGroup;
            amenityGroup.addTo(map);
            if (type === 'bus') {
                populateBusStopsSelect();
            }
        }
    })
}

function populateBusStopsSelect() {
    var select = document.getElementById("select-bus-line");
    var options = Array.from(publicTransportLines.keys()).filter(a => a != null).sort((a, b) => a - b);
    if (select.children) {
        Array.from(select.children).forEach(ch => { if (ch.value != -1) { select.removeChild(ch) } });
    }
    for (var i = 0; i < options.length; i++) {
        var opt = options[i];
        var el = document.createElement("option");
        el.textContent = (publicTransportLines.get(opt).startsWith(opt) ? '' : opt + ': ') + publicTransportLines.get(opt);
        el.value = opt;
        select.appendChild(el);
    }
}

function removeBusStops() {
    if (publicTransportContols['bus_stop']) {
        map.removeLayer(publicTransportContols['bus_stop']);
        publicTransportContols['bus_stop'] = null;
    }
}

function showBusStops() {
    let checkedOption = document.getElementById('select-bus-line').value;
    removeBusStops();
    if (checkedOption) {
        getBusStops(checkedOption);
    }

}

function getBusStops(ref) {
    let type = 'bus_stop';
    let filterValue = `'route = ''bus'' and ref = ''${ref}'' AND bbox(way, ${getBBoxCoordinates()})'`;
    let filter = `highway='${type}' AND dwithin(way, collectGeometries(queryCollection('serbia:planet_osm_line_new', 'way', ${filterValue})), 10, meters)`;
    let apiUrl = `${serverBaseUrl}/wfs?service=wfs&version=1.1.0&request=GetFeature&typenames=${layer.point4326}&outputformat=json&cql_filter=${filter}&CRS=EPSG:4326&propertyName=`;
    sendApiRequest(apiUrl, null, function (data) {
        if (data && data.features) {
            var amenities = data.features.map(feature =>
                markFeature([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], feature.properties.name, type)
            );
            let amenityGroup = L.layerGroup(amenities);
            publicTransportContols[type] = amenityGroup;
            amenityGroup.addTo(map);
        }
    })
}

function addNewFeature() {
    const point = draggableMarkerForInsert;
    let name = document.getElementById('insert-name').value;
    let type = document.getElementById('insert-type').value;
    const insertData = prepareGMLDataForInsertPoint(name, 'highway', type, point.getLatLng().lng, point.getLatLng().lat);

    var wfsUrl = `${serverBaseUrl}/wfs`;
    console.log(insertData);
    $.ajax({
        type: "POST",
        url: wfsUrl,
        dataType: "xml",
        contentType: "text/xml",
        data: insertData,
        success: function (xml) {
            console.log(xml);
            addTraficFeatureLayer(type, true);
        }
    });
}

function prepareGMLDataForInsertPoint(name, column, columnValue, pointLng, pointLat) {
    var postData =
        '<wfs:Transaction\n'
        + '  service="WFS"\n'
        + '  version="1.1.0"\n'
        + `xmlns:serbia ="${serbiaNamespace}"\n`
        + `  xmlns:wfs="http://www.opengis.net/wfs"\n`
        + `  xmlns:gml="http://www.opengis.net/gml"\n`
        + `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n`
        + `   xsi:schemaLocation="http://www.opengis.net/wfs ${serverBaseUrl}/schemas/wfs/1.1.0/wfs.xsd\n`
        + `                      ${serverBaseUrl}/serbia/wfs/DescribeFeatureType?typename=serbia:planet_osm_point">\n`
        + '  <wfs:Insert>\n'
        + '   <serbia:planet_osm_point>\n'
        + `   <serbia:name>${name}</serbia:name>\n`
        + `   <serbia:${column}>${columnValue}</serbia:${column}>\n`
        + '   <serbia:way>\n'
        + '       <gml:Point srsName="http://www.opengis.net/gml/srs/epsg.xml#4326">\n'
        + '            <gml:coordinates xmlns:gml="http://www.opengis.net/gml" decimal="." cs="," ts=" ">' + pointLng + ',' + pointLat + '</gml:coordinates>\n'
        + '        </gml:Point>\n'
        + '   </serbia:way>\n'
        + '  </serbia:planet_osm_point>\n'
        + '  </wfs:Insert>\n'
        + '</wfs:Transaction>';

    return postData;
}




function sendApiRequest(url, latlng, successCallback) {
    $.ajax({
        url: url,
        dataType: "json",
        type: "GET",
        success: function (data) { successCallback(data, latlng) }
    });
}

function presentFeaturePopup(data, latlng) { //data returned from server
    if (data && data.features) {
        data.features.forEach(feature => {
            var message = Object.entries(feature.properties)
                .filter(([name, value]) => value !== null)
                .reduce(function (acc, [name, value]) {
                    return acc + ' ' + name + ': ' + value + '<br>';
                }, '');
            showPopup(message, latlng);
        });

    }
}

function showPopup(popupMessage, latlng) {
    let popup = new L.Popup({
        maxWidth: 300
    });
    popup.setContent(popupMessage);
    popup.setLatLng(latlng);
    map.openPopup(popup);
}

function markFeature(latlng, message, iconName) {
    var options = iconName && icons[iconName] ? { icon: icons[iconName] } : {};
    var marker = L.marker(latlng, options)
        .bindPopup(message).openPopup()
    return marker;
}
