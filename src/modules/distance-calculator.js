const axios = require('axios');

class DistanceCalculator {
    // Origin coordinates: Nanpura, Surat
    get ORIGIN_LAT() { return 21.1811; }
    get ORIGIN_LON() { return 72.8075; }

    /**
     * Calculate driving distance from Nanpura, Surat to a destination address
     * Uses OpenStreetMap Nominatim for geocoding (free, no API key needed)
     * Uses OSRM for routing (free, no API key needed)
     * @param {string} address - Destination address
     * @returns {Promise<{success: boolean, distance?: number, text?: string, error?: string}>}
     */
    async calculateDistance(address) {
        if (!address || address.trim() === '') {
            return { success: false, error: 'સરનામું ખાલી છે.' };
        }

        try {
            // Step 1: Geocode the destination address using OSM Nominatim
            const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
            const geoResponse = await axios.get(geoUrl, {
                headers: {
                    'User-Agent': 'ExciseInspectionManager-Surat/4.0'
                },
                timeout: 10000
            });

            if (!geoResponse.data || geoResponse.data.length === 0) {
                return { success: false, error: 'સરનામું શોધી શકાયું નથી.' };
            }

            const destLat = parseFloat(geoResponse.data[0].lat);
            const destLon = parseFloat(geoResponse.data[0].lon);

            // Step 2: Get driving distance from OSRM
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${this.ORIGIN_LON},${this.ORIGIN_LAT};${destLon},${destLat}?overview=false`;
            const routeResponse = await axios.get(osrmUrl, { timeout: 10000 });

            if (routeResponse.data && routeResponse.data.routes && routeResponse.data.routes.length > 0) {
                const distanceMeters = routeResponse.data.routes[0].distance;
                const distanceKm = Math.round(distanceMeters / 1000 * 100) / 100;
                return { success: true, distance: distanceKm, text: `${distanceKm} km` };
            }

            return { success: false, error: 'અંતર માપી શકાયું નથી.' };
        } catch (e) {
            return { success: false, error: `અંતર ગણતરીમાં ભૂલ: ${e.message}` };
        }
    }

    /**
     * Get formatted distance text
     * @param {string} address
     * @returns {Promise<{success: boolean, distance?: number, text?: string, error?: string}>}
     */
    async getDistanceText(address) {
        return this.calculateDistance(address);
    }
}

module.exports = new DistanceCalculator();
