/* === WEATHER APP === */

let currentWeatherLocation = { name: 'London', lat: 51.5085, lon: -0.1257 };

async function initWeather(win) {
    // Initial fetch for default location
    fetchWeatherData(currentWeatherLocation.lat, currentWeatherLocation.lon, currentWeatherLocation.name);
}

async function weatherSearchCity(query) {
    if (!query) return;

    const display = document.getElementById('weather-main-display');
    if (!display) return;

    display.innerHTML = `
        <div class="weather-loading">
            <span class="material-icons-round shake">cloud_download</span>
            <p>Searching for ${query}...</p>
        </div>
    `;

    try {
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const loc = data.results[0];
            currentWeatherLocation = { name: loc.name, lat: loc.latitude, lon: loc.longitude };
            fetchWeatherData(loc.latitude, loc.longitude, loc.name);
        } else {
            display.innerHTML = `
                <div class="weather-error">
                    <span class="material-icons-round" style="color:#ff6b6b; font-size:48px;">error_outline</span>
                    <p>City not found. Please try another search.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error("Geocoding API error:", error);
        display.innerHTML = `
            <div class="weather-error">
                <span class="material-icons-round" style="color:#ff6b6b; font-size:48px;">wifi_off</span>
                <p>Network error connecting to location services.</p>
            </div>
        `;
    }
}

function weatherUseCurrentLocation() {
    if ("geolocation" in navigator) {
        document.getElementById('weather-main-display').innerHTML = `
            <div class="weather-loading">
                <span class="material-icons-round shake">my_location</span>
                <p>Detecting your location...</p>
            </div>
        `;

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                // Attempt to reverse geocode or just show coordinates
                try {
                    // Open-Meteo doesn't have a free reverse geocoding API that is reliable without an API key,
                    // so we'll just fetch the weather for the coordinates and label it "Current Location"
                    currentWeatherLocation = { name: "Current Location", lat, lon };
                    fetchWeatherData(lat, lon, "Current Location");
                } catch (e) {
                    fetchWeatherData(lat, lon, "Current Location");
                }
            },
            (error) => {
                showNotification("Weather Error", "Location access denied or unavailable.");
                fetchWeatherData(currentWeatherLocation.lat, currentWeatherLocation.lon, currentWeatherLocation.name); // revert to previous
            }
        );
    } else {
        showNotification("Weather Error", "Geolocation is not supported by your browser.");
    }
}

async function fetchWeatherData(lat, lon, locationName) {
    const display = document.getElementById('weather-main-display');
    if (!display) return;

    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`);
        const data = await response.json();
        renderWeatherUI(data, locationName, display);
    } catch (error) {
        console.error("Weather API error:", error);
        display.innerHTML = `
            <div class="weather-error">
                <span class="material-icons-round" style="color:#ff6b6b; font-size:48px;">wifi_off</span>
                <p>Error fetching weather data. Please check your connection.</p>
            </div>
        `;
    }
}

function getWeatherIconInfo(code, isDay) {
    // WMO Weather interpretation codes (WW)
    // https://open-meteo.com/en/docs
    const codes = {
        0: { icon: isDay ? 'light_mode' : 'dark_mode', desc: 'Clear sky' },
        1: { icon: isDay ? 'partly_cloudy_day' : 'partly_cloudy_night', desc: 'Mainly clear' },
        2: { icon: isDay ? 'partly_cloudy_day' : 'partly_cloudy_night', desc: 'Partly cloudy' },
        3: { icon: 'cloud', desc: 'Overcast' },
        45: { icon: 'foggy', desc: 'Fog' },
        48: { icon: 'foggy', desc: 'Depositing rime fog' },
        51: { icon: 'grain', desc: 'Drizzle: Light' },
        53: { icon: 'grain', desc: 'Drizzle: Moderate' },
        55: { icon: 'grain', desc: 'Drizzle: Dense' },
        56: { icon: 'ac_unit', desc: 'Freezing Drizzle: Light' },
        57: { icon: 'ac_unit', desc: 'Freezing Drizzle: Dense' },
        61: { icon: 'rainy', desc: 'Rain: Slight' },
        63: { icon: 'rainy', desc: 'Rain: Moderate' },
        65: { icon: 'rainy', desc: 'Rain: Heavy' },
        66: { icon: 'ac_unit', desc: 'Freezing Rain: Light' },
        67: { icon: 'ac_unit', desc: 'Freezing Rain: Heavy' },
        71: { icon: 'snowing', desc: 'Snow fall: Slight' },
        73: { icon: 'snowing', desc: 'Snow fall: Moderate' },
        75: { icon: 'snowing', desc: 'Snow fall: Heavy' },
        77: { icon: 'snowing', desc: 'Snow grains' },
        80: { icon: 'rainy', desc: 'Rain showers: Slight' },
        81: { icon: 'rainy', desc: 'Rain showers: Moderate' },
        82: { icon: 'rainy', desc: 'Rain showers: Violent' },
        85: { icon: 'snowing', desc: 'Snow showers slight' },
        86: { icon: 'snowing', desc: 'Snow showers heavy' },
        95: { icon: 'thunderstorm', desc: 'Thunderstorm: Slight or moderate' },
        96: { icon: 'thunderstorm', desc: 'Thunderstorm with slight hail' },
        99: { icon: 'thunderstorm', desc: 'Thunderstorm with heavy hail' }
    };
    return codes[code] || { icon: 'cloud', desc: 'Unknown' };
}

function renderWeatherUI(data, locationName, container) {
    const current = data.current;
    if (!current) return;

    const isDay = current.is_day === 1;
    const currentInfo = getWeatherIconInfo(current.weather_code, isDay);

    // Build 7-day forecast HTML
    let forecastHTML = '';
    if (data.daily && data.daily.time) {
        for (let i = 1; i < 7; i++) { // Skip today (index 0)
            const dateStr = data.daily.time[i];
            const dateObj = new Date(dateStr);
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const tempMax = Math.round(data.daily.temperature_2m_max[i]);
            const tempMin = Math.round(data.daily.temperature_2m_min[i]);
            const info = getWeatherIconInfo(data.daily.weather_code[i], true); // Always assume day icon for forecast

            forecastHTML += `
                <div class="weather-forecast-item">
                    <span class="forecast-day">${dayName}</span>
                    <span class="material-icons-round forecast-icon">${info.icon}</span>
                    <div class="forecast-temps">
                        <span class="temp-max">${tempMax}°</span>
                        <span class="temp-min">${tempMin}°</span>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = `
        <div class="weather-current-section">
            <h2 class="weather-location-title">${locationName}</h2>
            <div class="weather-current-main">
                <span class="material-icons-round weather-main-icon ${isDay ? 'weather-day' : 'weather-night'}">${currentInfo.icon}</span>
                <div class="weather-temp-box">
                    <div class="weather-temp-large">${Math.round(current.temperature_2m)}°C</div>
                    <div class="weather-desc">${currentInfo.desc}</div>
                </div>
            </div>
            
            <div class="weather-details-grid">
                <div class="weather-detail-card">
                    <span class="material-icons-round">thermostat</span>
                    <div class="detail-value">Feels like</div>
                    <div class="detail-data">${Math.round(current.apparent_temperature)}°C</div>
                </div>
                <div class="weather-detail-card">
                    <span class="material-icons-round">water_drop</span>
                    <div class="detail-value">Humidity</div>
                    <div class="detail-data">${current.relative_humidity_2m}%</div>
                </div>
                <div class="weather-detail-card">
                    <span class="material-icons-round">air</span>
                    <div class="detail-value">Wind</div>
                    <div class="detail-data">${current.wind_speed_10m} km/h</div>
                </div>
                <div class="weather-detail-card">
                    <span class="material-icons-round">umbrella</span>
                    <div class="detail-value">Precipitation</div>
                    <div class="detail-data">${current.precipitation} mm</div>
                </div>
            </div>
        </div>
        
        <div class="weather-forecast-list">
            ${forecastHTML}
        </div>
    `;

    // Add dynamic background class based on day/night
    const appEl = container.closest('.app-weather');
    if (appEl) {
        if (isDay) {
            appEl.classList.remove('night-theme');
            appEl.classList.add('day-theme');
        } else {
            appEl.classList.remove('day-theme');
            appEl.classList.add('night-theme');
        }
    }
}
