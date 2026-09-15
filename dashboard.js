/*
    OTTHONI BKK DASHBOARD
*/


/* ==========================================
   BEÁLLÍTÁSOK
========================================== */

const API_URL =
    "https://almos-bkk-dashboard.rozsahegyi97.workers.dev";


/* ==========================================
   ÓRA
========================================== */

function updateClock() {

    const now = new Date();

    const hours =
        String(now.getHours())
            .padStart(2, "0");

    const minutes =
        String(now.getMinutes())
            .padStart(2, "0");


    document.getElementById("time")
        .textContent =
        `${hours}:${minutes}`;
}


/* ==========================================
   DÁTUM
========================================== */

function updateDate() {

    const now = new Date();


    const days = [
        "Vasárnap",
        "Hétfő",
        "Kedd",
        "Szerda",
        "Csütörtök",
        "Péntek",
        "Szombat"
    ];


    const months = [
        "január",
        "február",
        "március",
        "április",
        "május",
        "június",
        "július",
        "augusztus",
        "szeptember",
        "október",
        "november",
        "december"
    ];


    const text =
        `${days[now.getDay()]}, ` +
        `${months[now.getMonth()]} ` +
        `${now.getDate()}.`;


    document.getElementById("date")
        .textContent =
        text;
}


/* ==========================================
   BKK + IDŐJÁRÁS + SZÜLETÉSNAP
========================================== */

async function loadDashboard() {

    try {

        const response =
            await fetch(API_URL);


        if (!response.ok) {

            throw new Error(
                `API hiba: ${response.status}`
            );

        }


        const data =
            await response.json();


        /* ===============================
           BKK
        =============================== */

        if (data.departures) {

            renderBusDepartures(
                data.departures
            );


            renderHevDepartures(
                data.departures
            );

        }


        /* ===============================
           IDŐJÁRÁS
        =============================== */

        if (data.weather) {

            renderWeather(
                data.weather
            );

        }


        /* ===============================
           SZÜLETÉSNAP
        =============================== */

        updateBirthdays(
            data.birthday
        );


    } catch (error) {

        console.error(
            "Dashboard hiba:",
            error
        );


        showError(
            "bus-departures"
        );


        showError(
            "hev-departures"
        );

    }
}

/* ==========================================
   BUSZOK
========================================== */

function renderBusDepartures(
    departures
) {

    const container =
        document.getElementById(
            "bus-departures"
        );


    const buses =
        departures
            .filter(departure => {

                return (
                    departure.stop ===
                    "Jókai Mór utca"
                );

            })
            .sort(
                (a, b) =>
                    a.timestamp -
                    b.timestamp
            )
            .slice(0, 3);


    container.innerHTML = "";


    if (buses.length === 0) {

        container.innerHTML = `
            <div class="error">
                Nincs közelgő buszjárat
            </div>
        `;

        return;
    }


    buses.forEach(
        departure => {

            createDepartureRow(
                container,
                departure
            );

        }
    );
}


/* ==========================================
   HÉV
========================================== */

function renderHevDepartures(
    departures
) {

    const container =
        document.getElementById(
            "hev-departures"
        );


    const hevs =
        departures
            .filter(departure => {

                return (
                    departure.stop ===
                    "Mátyásföld, repülőtér H"
                );

            })
            .sort(
                (a, b) =>
                    a.timestamp -
                    b.timestamp
            )
            .slice(0, 3);


    container.innerHTML = "";


    if (hevs.length === 0) {

        container.innerHTML = `
            <div class="error">
                Nincs közelgő HÉV
            </div>
        `;

        return;
    }


    hevs.forEach(
        departure => {

            createDepartureRow(
                container,
                departure
            );

        }
    );
}


/* ==========================================
   INDULÁSI SOR
========================================== */

function createDepartureRow(
    container,
    departure
) {

    const row =
        document.createElement("div");


    row.className =
        "departure";


    row.innerHTML = `

        <div class="route">
            ${departure.route}
        </div>

        <div class="destination">
            ${departure.destination}
        </div>

        <div class="minutes">
            ${departure.minutes}'
        </div>

    `;


    container.appendChild(row);
}


/* ==========================================
   IDŐJÁRÁS
========================================== */

function renderWeather(
    weather
) {

    /* --------------------------------------
       Hőmérséklet
    -------------------------------------- */

    const temperature =
        document.querySelector(
            ".temperature"
        );


    if (temperature) {

        temperature.textContent =
            `${weather.temperature}°C`;

    }


    /* --------------------------------------
       Ikon
    -------------------------------------- */

    const iconElement =
        document.querySelector(
            ".weather-icon"
        );


    if (iconElement) {

        iconElement.textContent =
            getWeatherIcon(
                weather.weatherCode,
                weather.isDay
            );

    }


    /* --------------------------------------
       Leírás
    -------------------------------------- */

    const description =
        document.querySelector(
            ".weather-description"
        );


    if (description) {

        description.textContent =
            getWeatherDescription(
                weather.weatherCode
            );

    }


    /* --------------------------------------
       Minimum / maximum
    -------------------------------------- */

    const range =
        document.querySelector(
            ".weather-range"
        );


    if (range) {

        range.textContent =
            `${weather.min}° – ${weather.max}°`;

    }


    /* --------------------------------------
       Helyszín
    -------------------------------------- */

    const location =
        document.querySelector(
            ".weather-location"
        );


    if (location) {

        location.textContent =
            "Budapest";

    }


    /* --------------------------------------
       Extra adatok
    -------------------------------------- */

    let extra =
        document.getElementById(
            "weather-extra"
        );


    if (!extra) {

        extra =
            document.createElement("div");


        extra.id =
            "weather-extra";


        extra.className =
            "weather-extra";


        const weatherContainer =
            document.querySelector(
                ".weather"
            );


        if (weatherContainer) {

            weatherContainer.appendChild(
                extra
            );

        }

    }


    if (extra) {

        extra.innerHTML = `

            <div class="weather-detail">
                🌧️ Eső esélye:
                <strong>
                    ${weather.rainChance}%
                </strong>
            </div>

            <div class="weather-detail">
                ☀️ Napkelte:
                <strong>
                    ${formatTime(
                        weather.sunrise
                    )}
                </strong>
            </div>

            <div class="weather-detail">
                🌇 Napnyugta:
                <strong>
                    ${formatTime(
                        weather.sunset
                    )}
                </strong>
            </div>

        `;

    }

}


/* ==========================================
   IDŐJÁRÁS IKON
========================================== */

function getWeatherIcon(
    code,
    isDay
) {

    if (code === 0) {

        return isDay
            ? "☀️"
            : "🌙";

    }


    if (
        code === 1 ||
        code === 2
    ) {

        return isDay
            ? "🌤️"
            : "☁️";

    }


    if (code === 3) {

        return "☁️";

    }


    if (
        code === 45 ||
        code === 48
    ) {

        return "🌫️";

    }


    if (
        code >= 51 &&
        code <= 57
    ) {

        return "🌦️";

    }


    if (
        code >= 61 &&
        code <= 67
    ) {

        return "🌧️";

    }


    if (
        code >= 71 &&
        code <= 77
    ) {

        return "❄️";

    }


    if (
        code >= 80 &&
        code <= 82
    ) {

        return "🌦️";

    }


    if (
        code >= 95 &&
        code <= 99
    ) {

        return "⛈️";

    }


    return "🌤️";
}


/* ==========================================
   IDŐJÁRÁS SZÖVEG
========================================== */

function getWeatherDescription(
    code
) {

    if (code === 0) {
        return "Derült";
    }


    if (code === 1) {
        return "Többnyire derült";
    }


    if (code === 2) {
        return "Részben felhős";
    }


    if (code === 3) {
        return "Borult";
    }


    if (
        code === 45 ||
        code === 48
    ) {

        return "Köd";

    }


    if (
        code >= 51 &&
        code <= 57
    ) {

        return "Szitálás";

    }


    if (
        code >= 61 &&
        code <= 67
    ) {

        return "Eső";

    }


    if (
        code >= 71 &&
        code <= 77
    ) {

        return "Havazás";

    }


    if (
        code >= 80 &&
        code <= 82
    ) {

        return "Zápor";

    }


    if (
        code >= 95 &&
        code <= 99
    ) {

        return "Zivatar";

    }


    return "Ismeretlen";
}


/* ==========================================
   IDŐ FORMÁZÁSA
========================================== */

function formatTime(
    dateString
) {

    if (!dateString) {

        return "--:--";

    }


    const date =
        new Date(dateString);


    if (
        isNaN(
            date.getTime()
        )
    ) {

        return "--:--";

    }


    const hours =
        String(
            date.getHours()
        ).padStart(2, "0");


    const minutes =
        String(
            date.getMinutes()
        ).padStart(2, "0");


    return `${hours}:${minutes}`;
}


/* ==========================================
   SZÜLETÉSNAPOK
========================================== */

function updateBirthdays(birthday) {

    const container =
        document.getElementById("birthdays");

    if (!container) {
        return;
    }

    if (!birthday) {
        container.textContent =
            "Nincs ma születésnap";
        return;
    }

    container.textContent = birthday;
}


/* ==========================================
   NÉVNAPOK
========================================== */

async function updateNamedays() {

    const container = document.getElementById("namedays");

    if (!container) {
        return;
    }

    try {

        const response = await fetch("./nevnapok.json");

        if (!response.ok) {
            throw new Error(
                "Névnap adatbázis nem elérhető: HTTP " +
                response.status
            );
        }

        const namedays = await response.json();

        const now = new Date();

        const month = String(now.getMonth() + 1);
        const day = String(now.getDate());

        console.log("Névnap keresés:", month, day);

        const today =
            namedays[month] &&
            namedays[month][day];

        if (!today) {

            container.textContent = "Nincs adat";

            return;
        }


        /* ==============================
           FŐ NÉVNAPOK
        ============================== */

        const mainNames =
            Array.isArray(today.main)
                ? today.main
                : [];


        if (mainNames.length === 0) {

            container.textContent = "Nincs adat";

            return;
        }


        /* ==============================
           MEGJELENÍTÉS
        ============================== */

        container.innerHTML = `
            <div class="nameday-main">
                ${mainNames.join(", ")}
            </div>
        `;


    } catch (error) {

        console.error(
            "Névnap hiba:",
            error
        );

        container.textContent =
            "Névnap adat nem elérhető";
    }
}

/* ==========================================
   HIBA
========================================== */

function showError(
    elementId
) {

    const element =
        document.getElementById(
            elementId
        );


    if (!element) {

        return;

    }


    element.innerHTML = `
        <div class="error">
            BKK adat nem elérhető
        </div>
    `;
}


/* ==========================================
   INDÍTÁS
========================================== */

updateClock();

updateDate();

updateNamedays();

loadDashboard();


/* ==========================================
   ÓRA
========================================== */

setInterval(
    updateClock,
    1000
);


/* ==========================================
   DÁTUM
========================================== */

setInterval(
    updateDate,
    60000
);


/* ==========================================
   SZÜLETÉSNAP
========================================== */

setInterval(
    updateBirthdays,
    60000
);


/* ==========================================
   NÉVNAP
========================================== */

setInterval(
    updateNamedays,
    60000
);


/* ==========================================
   BKK + IDŐJÁRÁS
========================================== */

setInterval(
    loadDashboard,
    30000
);
