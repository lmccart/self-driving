let init = false;
let userLoc;
let lastDir, dirInterval, route;

$('#start').click(initApp);

mapboxgl.accessToken = 'pk.eyJ1IjoibGF1cmVubGVlbWFjayIsImEiOiJja3BjMWJmMDcwNzh3MnBtbHIxeHIwMWgwIn0.7y2mRzNJ7IS467f_-ZHSFg';
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v11',
  center: [-118.441429, 34.076236],
  zoom: 15
});

//temp
// map.on('load', () => {
//   userLoc = [-118.441429, 34.076236];
//   initMap();
// });

map.on('load', () => {
  const geolocate = new mapboxgl.GeolocateControl({
    positionOptions: {
      enableHighAccuracy: true
    },
    trackUserLocation: true
  });
  map.addControl(geolocate);
  geolocate.on('geolocate', (e) => {
    console.log('A geolocate event has occurred.');
    userLoc = [e.coords.longitude, e.coords.latitude];
    if (!init) {
      initMap();
    }
  });
});

function initApp() {
  
  let utter = new SpeechSynthesisUtterance('Hello world');
  window.speechSynthesis.speak(utter);
}


function initMap() {
  init = true;
  map.on('click', displayRoute);
  map.addLayer({
    id: 'point',
    type: 'circle',
    source: {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: userLoc }
          }
        ]
      }
    },
    paint: {  'circle-radius': 10, 'circle-color': '#3887be' }
  });
}

function displayRoute(event) {
  const coords = Object.keys(event.lngLat).map((key) => event.lngLat[key]);
    const end = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Point',
            coordinates: coords
          }
        }
      ]
    };
    if (map.getLayer('end')) {
      map.getSource('end').setData(end);
    } else {
      map.addLayer({
        id: 'end',
        type: 'circle',
        source: {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'Point',
                  coordinates: coords
                }
              }
            ]
          }
        },
        paint: {
          'circle-radius': 10,
          'circle-color': '#f30'
        }
      });
    }
    getRoute(coords);
}

async function getRoute(end) {
  const query = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${userLoc[0]},${userLoc[1]};${end[0]},${end[1]}?steps=true&voice_instructions=true&geometries=geojson&access_token=${mapboxgl.accessToken}`,
    { method: 'GET' }
  );
  const json = await query.json();
  console.log(json)
  route = json.routes[0];

  const coords = route.geometry.coordinates;
  const geojson = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: coords
    }
  };
  // if the route already exists on the map, we'll reset it using setData
  if (map.getSource('route')) {
    map.getSource('route').setData(geojson);
  }
  // otherwise, we'll make a new request
  else {
    map.addLayer({
      id: 'route',
      type: 'line',
      source: {
        type: 'geojson',
        data: geojson
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#3887be',
        'line-width': 5,
        'line-opacity': 0.75
      }
    });
  }
  // get the sidebar and add the instructions
  const instructions = document.getElementById('instructions');
  const steps = route.legs[0].steps;

  let tripInstructions = '';
  for (const step of steps) {
    tripInstructions += `<li>${step.maneuver.instruction}</li>`;
  }
  instructions.innerHTML = `<p><strong>Trip duration: ${Math.floor(
    route.duration / 60
  )} min 🚴 </strong></p><ol>${tripInstructions}</ol>`;


  if (dirInterval) clearInterval(dirInterval);
  dirInterval = setInterval( () => { checkRoute(); }, 1000);
}

function checkRoute() {
  let step = getCurrentStep();
  console.log(step);

  let dir = getCurrentDirection(step);

  if (dir.announcement !== lastDir) {
    lastDir = dir.announcement;
    let utter = new SpeechSynthesisUtterance(lastDir);
    window.speechSynthesis.speak(utter);
    console.log(lastDir);
  }
}

function getCurrentDirection(step) {
  let directions = route.legs[0].steps[step.curStep].voiceInstructions;
  let minDist = 999999999999999999999;
  let curDir = -1;

  for (let i = 0; i < directions.length; i++) {
    let dist = Math.abs(step.stepEndDist - directions[i].distanceAlongGeometry);
    if (dist < minDist) {
      minDist = dist;
      curDir = i;
    } else {
      return directions[curDir];
    }
  }
}

function getCurrentStep() {
  let minDist = 999999999999999999999;
  let stepEndDist = 0;
  let curStep = -1, curGeo = -1;
  for (let j = 0; j < route.legs[0].steps.length; j++) {
    let step = route.legs[0].steps[j];
    // console.log('step ', j);
    for (let i = step.geometry.coordinates.length - 1; i >= 0; i--) {
      let geo = step.geometry.coordinates[i];
      console.log('geo ', i);
      let dist = getDistanceFromLatLonInM(userLoc[0], userLoc[1], geo[0], geo[1]);

      console.log(j, i, geo[0], geo[1], dist);
      if (dist < minDist) {
        // console.log(dist, minDist, stepEndDist, curStep); 
        if (i === step.geometry.coordinates.length - 1) stepEndDist = dist;
        minDist = dist;
        curStep = j;
        curGeo = i;
      } else {
        console.log('curStep', curStep, 'curGeo', curGeo, 'endDist', stepEndDist); 
        return {'curStep': curStep, 'curGeo': curGeo, 'stepEndDist': stepEndDist};
      }
    }
  }
}

function getDistanceFromLatLonInM(lon1, lat1, lon2, lat2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c * 1000; // Distance in m
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}