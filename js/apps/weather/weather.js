/**
 * Hyggshi OS Web Edition
 * Weather Application Module
 * 
 * Standardized and Encapsulated
 */

const WeatherApp = {
    // --- State ---
    currentLocation: { name: 'London', lat: 51.5085, lon: -0.1257 },

    // --- Initialization ---
    init(win) {
        this.fetchWeatherData(this.currentLocation.lat, this.currentLocation.lon, this.currentLocation.name);
    },

    // --- Actions ---
    async searchCity(query) {
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
                this.currentLocation = { name: loc.name, lat: loc.latitude, lon: loc.longitude };
                this.fetchWeatherData(loc.latitude, loc.longitude, loc.name);
            } else {
                this.renderError(display, 'City not found. Please try another search.', 'error_outline');
            }
        } catch (error) {
            console.error("Geocoding API error:", error);
            this.renderError(display, 'Network error connecting to location services.', 'wifi_off');
        }
    },

    useCurrentLocation() {
        if (!("geolocation" in navigator)) {
            showNotification("Weather Error", "Geolocation is not supported by your browser.");
            return;
        }

        const display = document.getElementById('weather-main-display');
        if (display) {
            display.innerHTML = `
                <div class="weather-loading">
                    <span class="material-icons-round shake">my_location</span>
                    <p>Detecting your location...</p>
                </div>
            `;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                this.currentLocation = { name: "Current Location", lat, lon };
                this.fetchWeatherData(lat, lon, "Current Location");
            },
            (error) => {
                showNotification("Weather Error", "Location access denied or unavailable.");
                this.fetchWeatherData(this.currentLocation.lat, this.currentLocation.lon, this.currentLocation.name);
            }
        );
    },

    async fetchWeatherData(lat, lon, locationName) {
        const display = document.getElementById('weather-main-display');
        if (!display) return;

        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`);
            const data = await response.json();
            this.renderUI(data, locationName, display);
        } catch (error) {
            console.error("Weather API error:", error);
            this.renderError(display, 'Error fetching weather data. Please check your connection.', 'wifi_off');
        }
    },

    // --- Rendering ---
    renderUI(data, locationName, container) {
        const current = data.current;
        if (!current) return;

        const isDay = current.is_day === 1;
        const currentInfo = this.getIconInfo(current.weather_code, isDay);

        let forecastHTML = '';
        if (data.daily?.time) {
            for (let i = 1; i < 7; i++) {
                const dateObj = new Date(data.daily.time[i]);
                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                const tempMax = Math.round(data.daily.temperature_2m_max[i]);
                const tempMin = Math.round(data.daily.temperature_2m_min[i]);
                const info = this.getIconInfo(data.daily.weather_code[i], true);

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
                    ${this.renderDetailCard('thermostat', 'Feels like', `${Math.round(current.apparent_temperature)}°C`)}
                    ${this.renderDetailCard('water_drop', 'Humidity', `${current.relative_humidity_2m}%`)}
                    ${this.renderDetailCard('air', 'Wind', `${current.wind_speed_10m} km/h`)}
                    ${this.renderDetailCard('umbrella', 'Precipitation', `${current.precipitation} mm`)}
                </div>
            </div>
            <div class="weather-forecast-list">${forecastHTML}</div>
        `;

        this.updateTheme(container, isDay);
    },

    renderDetailCard(icon, label, value) {
        return `
            <div class="weather-detail-card">
                <span class="material-icons-round">${icon}</span>
                <div class="detail-value">${label}</div>
                <div class="detail-data">${value}</div>
            </div>
        `;
    },

    renderError(container, message, icon) {
        container.innerHTML = `
            <div class="weather-error">
                <span class="material-icons-round" style="color:#ff6b6b; font-size:48px;">${icon}</span>
                <p>${message}</p>
            </div>
        `;
    },

    updateTheme(container, isDay) {
        const appEl = container.closest('.app-weather');
        if (appEl) {
            appEl.classList.toggle('day-theme', isDay);
            appEl.classList.toggle('night-theme', !isDay);
        }
    },

    // --- Helpers ---
    getIconInfo(code, isDay) {
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
};

// --- Compatibility Wrappers for HTML Events ---
function initWeather(win) { WeatherApp.init(win); }
function weatherSearchCity(query) { WeatherApp.searchCity(query); }
function weatherUseCurrentLocation() { WeatherApp.useCurrentLocation(); }

window.WeatherApp = WeatherApp;
