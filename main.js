let mapInitialized = false, routeInitialized = false;
let userLoc;
let lastDir, lastStep, route;
let debug = true;
let lastPromptTime = -60000;

$('#start').click(initSpeech);

mapboxgl.accessToken = 'pk.eyJ1IjoibGF1cmVubGVlbWFjayIsImEiOiJja3BjMWJmMDcwNzh3MnBtbHIxeHIwMWgwIn0.7y2mRzNJ7IS467f_-ZHSFg';
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v11',
  center: [-118.441429, 34.076236],
  zoom: 15
});
const geolocate = new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true });
map.addControl(geolocate);

map.on('load', () => {
  geolocate.on('geolocate', (e) => {
    console.log('A geolocate event has occurred.');
    updateLoc(e.coords.longitude, e.coords.latitude);
    if (!mapInitialized) initMap();
    if (routeInitialized) checkRoute();
  });
  geolocate.trigger();
});

function initMap() {
  mapInitialized = true;
  map.addLayer({
    id: 'point',
    type: 'circle',
    source: {
      type: 'geojson',
      data: {  type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: userLoc } }] }
    },
    paint: {  'circle-radius': 10, 'circle-color': '#3887be' }
  });
  map.on('click', (e) => {
    if (routeInitialized && debug) {
      console.log(e);
      updateLoc(e.lngLat.lng, e.lngLat.lat);
      checkRoute();
    } else {
      displayRoute(e);
    }
  });
}

function updateLoc(lon, lat) {
  userLoc = [lon, lat];
  $('#debug').html(`${lon}, ${lat}`);
  if (mapInitialized) {
    map.getSource('point').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: userLoc } }] });
  }
}

function displayRoute(event) {
  routeInitialized = true;
  const coords = Object.keys(event.lngLat).map((key) => event.lngLat[key]);
    const end = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: coords } }] };
    if (map.getLayer('end')) {
      map.getSource('end').setData(end);
    } else {
      map.addLayer({
        id: 'end',
        type: 'circle',
        source: {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},  geometry: { type: 'Point', coordinates: coords } }]}
        },
        paint: { 'circle-radius': 10, 'circle-color': '#f30'}
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
  const geojson = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
  if (map.getSource('route')) {
    map.getSource('route').setData(geojson);
  } else {
    map.addLayer({
      id: 'route', type: 'line',
      source: { type: 'geojson', data: geojson },
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3887be', 'line-width': 5, 'line-opacity': 0.75 }
    });
  }
  // writeInstructions();
  checkRoute();
}

function checkRoute() {
  let step = getCurrentStep();
  if (step.routeStep !== lastStep) {
    lastStep = step.routeStep;
    prompt();
  }
  let dir = getCurrentDirection(step);
  if (dir.announcement !== lastDir) {
    lastDir = dir.announcement;
    speak(lastDir, true);
    console.log(lastDir);
  }
}

function getCurrentDirection(step) {
  let directions = route.legs[0].steps[step.routeStep].voiceInstructions;
  let minDist = 999999999999999999999;
  let curDir = -1;
  for (let i = 0; i < directions.length; i++) {
    let dist = Math.abs(step.routeStepEndDist - directions[i].distanceAlongGeometry);
    // console.log(i, step.routeStepEndDist, directions[i].distanceAlongGeometry, dist);
    if (dist < minDist) {
      minDist = dist;
      curDir = i;
    }
  }
  // console.log('minDist', minDist, 'curDir', curDir);
  return directions[curDir];
}

function getCurrentStep() {
  let minRouteDist = 999999999999999999999;
  let minStepDist = 999999999999999999999;
  let routeStep = -1, routeGeo = -1, routeStepEndDist = -1;
  for (let j = 0; j < route.legs[0].steps.length; j++) {
    let step = route.legs[0].steps[j];

    let stepEndDist = -1, stepGeo = -1;
    for (let i = step.geometry.coordinates.length - 1; i >= 0; i--) {
      let geo = step.geometry.coordinates[i];
      let dist = getDistanceFromLatLonInM(userLoc[0], userLoc[1], geo[0], geo[1]);

      if (dist < minStepDist) {
        minStepDist = dist;
        stepGeo = i;
      }        
      if (i === step.geometry.coordinates.length - 1) {
        stepEndDist = dist;
      }
    }
    if (minStepDist < minRouteDist) {
      minRouteDist = minStepDist;
      routeStep = j;
      routeGeo = stepGeo;
      routeStepEndDist = stepEndDist;
    }
  }

  console.log('routeStep', routeStep, 'routeGeo', routeGeo, 'routeStepEndDist', routeStepEndDist);
  return {'routeStep': routeStep, 'routeGeo': routeGeo, 'routeStepEndDist': routeStepEndDist};
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

function initSpeech() {
  $('.overlay').hide();
  speak('Hi there. Once your location has been determined, touch anywhere on the map to begin navigating.', true);
}

function writeInstructions() {
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
}

function speak(phrase, display) {
  let utter = new SpeechSynthesisUtterance(phrase);
  window.speechSynthesis.speak(utter);
  if (display) $('#instructions').html(phrase);
}

let prompts = [
  {phrase: 'Remember when you got lost.'},
  {phrase: 'Remember when you were late.'},
  {phrase: 'Remember a time you were driven by someone else.'},
  {phrase: 'Remember learning to drive.'},
  {phrase: 'Remember when you were going too fast.'},
  {phrase: 'Remember when you regretted getting in a car'},
  {phrase: 'Remember when you got closer to someone in a car'},
  {phrase: 'Remember when you felt distant from someone while driving'},
  {phrase: 'Remember when you were feeling tired'},
  {phrase: 'Remember when you couldn\'t wait to get there'},
  {phrase: 'Where is the person in the next car going?'},
  {phrase: 'Where is the person in the next car coming from?'},
  {phrase: 'Turn on some music'},
  {phrase: 'Open the windows'},
  {phrase: 'Turn up the AC'},
  {phrase: 'Stop for something to eat'},
  {phrase: 'Pull over soon to stretch your legs'}
];

function prompt() {
  let availPrompts = prompts.filter((elt) => { return !(elt.played)});
  if (availPrompts.length && performance.now() - lastPromptTime > 60*1000) {
    let p = pickRandom(availPrompts);
    p.played = true;
    setTimeout(() => { speak(p.phrase); }, 10*1000);
    lastPromptTime = performance.now() + 10*1000;
  }
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}