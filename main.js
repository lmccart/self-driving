let init = false;
let userLoc;
let lastDir, dirInterval;

mapboxgl.accessToken = 'pk.eyJ1IjoibGF1cmVubGVlbWFjayIsImEiOiJja3BjMWJmMDcwNzh3MnBtbHIxeHIwMWgwIn0.7y2mRzNJ7IS467f_-ZHSFg';
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v11',
  center: [-122.662323, 45.523751], // starting position
  zoom: 3 // starting zoom
});



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
    if (dirInterval) clearInterval(dirInterval);
    dirInterval = setInterval( () => { getRoute(coords); }, 1000);
}

async function getRoute(end) {
  const query = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/cycling/${userLoc[0]},${userLoc[1]};${end[0]},${end[1]}?steps=true&voice_instructions=true&geometries=geojson&access_token=${mapboxgl.accessToken}`,
    { method: 'GET' }
  );
  const json = await query.json();
  console.log(json)
  const data = json.routes[0];
  
  updateDirections(data);

  const route = data.geometry.coordinates;
  const geojson = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: route
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
  const steps = data.legs[0].steps;

  let tripInstructions = '';
  for (const step of steps) {
    tripInstructions += `<li>${step.maneuver.instruction}</li>`;
  }
  instructions.innerHTML = `<p><strong>Trip duration: ${Math.floor(
    data.duration / 60
  )} min 🚴 </strong></p><ol>${tripInstructions}</ol>`;
}

function updateDirections(data) {
  let nextDir = data.legs[0].steps[0].voiceInstructions[0].announcement;
  if (nextDir !== lastDir) {
    console.log(nextDir);
    let utter = new SpeechSynthesisUtterance(nextDir);
    window.speechSynthesis.speak(utter);
    lastDir = nextDir;
  }
}