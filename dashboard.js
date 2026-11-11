/*
    OTTHONI BKK DASHBOARD

    Régi böngészőkben is futnia kell (Android 4.x gyári böngésző,
    régi Chrome), ezért szándékosan csak ES5:

    - nincs const / let, nyílfüggvény, template string, async / await
    - nincs fetch (XMLHttpRequest van helyette)
    - nincs padStart, emoji, flexbox
*/

(function () {

    "use strict";


    /* ==========================================
       BEÁLLÍTÁSOK
    ========================================== */

    var WORKER_HOST = "almos-bkk-dashboard.rozsahegyi97.workers.dev";

    var REFRESH_MS = 30000;
    var ROWS = 3;

    /* Feliratok a két irányhoz. "in" = Örs felé, "out" = hazafelé. */

    var ROUTES = {
        "in": {
            busFrom: "Jókai Mór utca",
            busTo: "Örs vezér tere",
            hevFrom: "Mátyásföld, repülőtér",
            hevTo: "Örs vezér tere"
        },
        "out": {
            busFrom: "Örs vezér tere",
            busTo: "Jókai Mór utca (Rendőrség)",
            hevFrom: "Örs vezér tere",
            hevTo: "Mátyásföld, repülőtér"
        }
    };

    var DAYS = [
        "Vasárnap", "Hétfő", "Kedd", "Szerda",
        "Csütörtök", "Péntek", "Szombat"
    ];

    var MONTHS = [
        "január", "február", "március", "április",
        "május", "június", "július", "augusztus",
        "szeptember", "október", "november", "december"
    ];


    /* ==========================================
       ÁLLAPOT
    ========================================== */

    var API_URL = getApiUrl();

    var startedAt = new Date().getTime();

    var state = {
        dir: readDirection(),   /* "in" vagy "out" */
        lists: {},              /* irányonként az utolsó jó lista */
        offset: 0,              /* szerver idő - tablet idő (ms) */
        ok: null,               /* sikerült-e az utolsó lekérés */
        lastOk: 0,
        legacy: false,          /* régi Worker: nincs hazafelé irány */
        bkkError: {},
        namedays: null,
        namedaysLoading: false
    };

    var lastHtml = {};
    var lastText = {};


    /* ==========================================
       SEGÉDEK
    ========================================== */

    function byId(id) {
        return document.getElementById(id);
    }

    function pad(number) {
        return (number < 10 ? "0" : "") + number;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    /* Csak akkor nyúlunk a DOM-hoz, ha tényleg változott valami. */

    function setText(id, text) {
        var element;

        if (lastText[id] === text) {
            return;
        }

        element = byId(id);

        if (element) {
            element.innerHTML = escapeHtml(text);
            lastText[id] = text;
        }
    }

    function setHtml(id, html) {
        var element;

        if (lastHtml[id] === html) {
            return;
        }

        element = byId(id);

        if (element) {
            element.innerHTML = html;
            lastHtml[id] = html;
        }
    }

    function setClass(id, className) {
        var element = byId(id);

        if (element && element.className !== className) {
            element.className = className;
        }
    }

    function getApiUrl() {
        var match = /[?&]api=([^&]+)/.exec(window.location.search);

        /* Teszteléshez: index.html?api=http://localhost:8787/api */
        if (match) {
            return decodeURIComponent(match[1]);
        }

        /* Ha magát az oldalt is a Worker szolgálja ki (régi tablet, sima HTTP). */
        if (/workers\.dev$/.test(window.location.hostname)) {
            return "/api";
        }

        return (window.location.protocol === "http:" ? "http:" : "https:") +
            "//" + WORKER_HOST + "/api";
    }

    function readDirection() {
        try {
            if (window.localStorage.getItem("bkk-direction") === "out") {
                return "out";
            }
        } catch (error) {
            /* privát mód vagy tiltott tároló: marad az alap irány */
        }

        return "in";
    }

    function saveDirection(dir) {
        try {
            window.localStorage.setItem("bkk-direction", dir);
        } catch (error) {
            /* nem baj, ha nem sikerül */
        }
    }

    /* A szerver órája szerinti "most": ebből számoljuk a perceket. */

    function serverNow() {
        return new Date().getTime() + state.offset;
    }

    /* A kijelzett óra: a tablet órája, kivéve ha nagyon el van állítva. */

    function displayNow() {
        var skew = Math.abs(state.offset) > 60000 ? state.offset : 0;

        return new Date(new Date().getTime() + skew);
    }

    function formatClock(timestamp) {
        var date = new Date(timestamp);

        return pad(date.getHours()) + ":" + pad(date.getMinutes());
    }

    /* "2026-11-11T06:42" -> "06:42" (a régi böngészők ezt Date-ként nem értik). */

    function timeFromIso(value) {
        var match = /T(\d{2}:\d{2})/.exec(String(value || ""));

        return match ? match[1] : "--:--";
    }

    function getJSON(url, callback) {
        var xhr = new XMLHttpRequest();
        var finished = false;
        var timer;

        function finish(error, result) {
            if (finished) {
                return;
            }

            finished = true;
            clearTimeout(timer);
            callback(error, result);
        }

        xhr.onreadystatechange = function () {
            var parsed;

            if (xhr.readyState !== 4) {
                return;
            }

            if (xhr.status < 200 || xhr.status >= 300) {
                finish(new Error("HTTP " + xhr.status));
                return;
            }

            try {
                parsed = JSON.parse(xhr.responseText);
            } catch (error) {
                finish(error);
                return;
            }

            finish(null, parsed);
        };

        timer = setTimeout(function () {
            try {
                xhr.abort();
            } catch (error) {
                /* mindegy */
            }

            finish(new Error("timeout"));
        }, 15000);

        try {
            xhr.open("GET", url, true);
            xhr.send(null);
        } catch (error) {
            finish(error);
        }
    }

    function withParam(url, name, value) {
        return url + (url.indexOf("?") === -1 ? "?" : "&") + name + "=" + value;
    }


    /* ==========================================
       IKONOK

       Régi Androidon nincs színes emoji, ezért
       minden ikon egy kis SVG kép.
    ========================================== */

    var SUN = "#ffc93c";
    var CLOUD = "#dfe7f2";
    var CLOUD_DARK = "#a9b6ca";
    var RAIN = "#4fc3f7";

    function svg(body) {
        return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" " +
            "viewBox=\"0 0 64 64\">" + body + "</svg>"
        );
    }

    function sunShape(cx, cy, r) {
        var parts = "<circle cx=\"" + cx + "\" cy=\"" + cy + "\" r=\"" + r +
            "\" fill=\"" + SUN + "\"/>";
        var i;
        var angle;
        var inner = r * 1.45;
        var outer = r * 2;

        for (i = 0; i < 8; i += 1) {
            angle = i * Math.PI / 4;

            parts += "<line x1=\"" + (cx + Math.cos(angle) * inner).toFixed(1) +
                "\" y1=\"" + (cy + Math.sin(angle) * inner).toFixed(1) +
                "\" x2=\"" + (cx + Math.cos(angle) * outer).toFixed(1) +
                "\" y2=\"" + (cy + Math.sin(angle) * outer).toFixed(1) +
                "\" stroke=\"" + SUN + "\" stroke-width=\"3.5\" stroke-linecap=\"round\"/>";
        }

        return parts;
    }

    function moonShape(transform) {
        return "<path transform=\"" + transform + "\" fill=\"#e6ecf7\" " +
            "d=\"M38 12a20 20 0 1 0 14 34A17 17 0 0 1 38 12z\"/>";
    }

    function cloudShape(dy, color) {
        return "<g transform=\"translate(0," + dy + ")\" fill=\"" + color + "\">" +
            "<circle cx=\"24\" cy=\"36\" r=\"10\"/>" +
            "<circle cx=\"36\" cy=\"30\" r=\"13\"/>" +
            "<circle cx=\"47\" cy=\"38\" r=\"8\"/>" +
            "<rect x=\"24\" y=\"36\" width=\"23\" height=\"10\"/>" +
            "</g>";
    }

    function drops(y, length) {
        var parts = "";
        var xs = [25, 35, 45];
        var i;

        for (i = 0; i < xs.length; i += 1) {
            parts += "<line x1=\"" + xs[i] + "\" y1=\"" + y +
                "\" x2=\"" + (xs[i] - length * 0.4) + "\" y2=\"" + (y + length) +
                "\" stroke=\"" + RAIN + "\" stroke-width=\"3.5\" stroke-linecap=\"round\"/>";
        }

        return parts;
    }

    function flakes() {
        return "<circle cx=\"24\" cy=\"52\" r=\"2.8\" fill=\"#ffffff\"/>" +
            "<circle cx=\"35\" cy=\"57\" r=\"2.8\" fill=\"#ffffff\"/>" +
            "<circle cx=\"46\" cy=\"52\" r=\"2.8\" fill=\"#ffffff\"/>";
    }

    function weatherIcon(code, isDay) {
        var sky = isDay ?
            sunShape(21, 21, 8) :
            moonShape("translate(2,0) scale(0.55)");

        if (code === 0) {
            return svg(isDay ? sunShape(32, 32, 11) : moonShape("translate(-2,3)"));
        }

        if (code === 1 || code === 2) {
            return svg(sky + cloudShape(6, CLOUD));
        }

        if (code === 3) {
            return svg(cloudShape(0, CLOUD_DARK));
        }

        if (code === 45 || code === 48) {
            return svg(
                "<g stroke=\"#b8c4d6\" stroke-width=\"4.5\" stroke-linecap=\"round\">" +
                "<line x1=\"14\" y1=\"20\" x2=\"44\" y2=\"20\"/>" +
                "<line x1=\"20\" y1=\"30\" x2=\"52\" y2=\"30\"/>" +
                "<line x1=\"12\" y1=\"40\" x2=\"46\" y2=\"40\"/>" +
                "<line x1=\"22\" y1=\"50\" x2=\"50\" y2=\"50\"/>" +
                "</g>"
            );
        }

        if (code >= 51 && code <= 57) {
            return svg(cloudShape(-8, CLOUD) + drops(45, 6));
        }

        if (code >= 61 && code <= 67) {
            return svg(cloudShape(-8, CLOUD_DARK) + drops(44, 12));
        }

        if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
            return svg(cloudShape(-8, CLOUD) + flakes());
        }

        if (code >= 80 && code <= 82) {
            return svg(sky + cloudShape(-2, CLOUD) + drops(50, 9));
        }

        if (code >= 95 && code <= 99) {
            return svg(
                cloudShape(-8, CLOUD_DARK) +
                "<polygon fill=\"" + SUN + "\" " +
                "points=\"35,40 26,53 33,53 29,63 42,48 34,48 38,40\"/>"
            );
        }

        return svg(sky + cloudShape(6, CLOUD));
    }

    function weatherText(code) {
        if (code === 0) { return "Derült"; }
        if (code === 1) { return "Többnyire derült"; }
        if (code === 2) { return "Részben felhős"; }
        if (code === 3) { return "Borult"; }
        if (code === 45 || code === 48) { return "Köd"; }
        if (code >= 51 && code <= 57) { return "Szitálás"; }
        if (code >= 61 && code <= 67) { return "Eső"; }
        if (code >= 71 && code <= 77) { return "Havazás"; }
        if (code >= 80 && code <= 82) { return "Zápor"; }
        if (code === 85 || code === 86) { return "Hózápor"; }
        if (code >= 95 && code <= 99) { return "Zivatar"; }

        return "Ismeretlen";
    }

    function setStaticIcons() {
        var arrow = svg(
            "<path fill=\"none\" stroke=\"#8fa0bb\" stroke-width=\"7\" " +
            "stroke-linecap=\"round\" stroke-linejoin=\"round\" " +
            "d=\"M8 32h46M36 14l18 18-18 18\"/>"
        );
        var images = document.getElementsByTagName("img");
        var i;

        for (i = 0; i < images.length; i += 1) {
            if (images[i].getAttribute("data-icon") === "arrow") {
                images[i].src = arrow;
            }
        }
    }


    /* ==========================================
       ÓRA + DÁTUM
    ========================================== */

    function renderClock() {
        var now = displayNow();

        setText("time", pad(now.getHours()) + ":" + pad(now.getMinutes()));
        setText("weekday", DAYS[now.getDay()]);
        setText("date", MONTHS[now.getMonth()] + " " + now.getDate() + ".");
    }


    /* ==========================================
       INDULÁSOK
    ========================================== */

    function modeOf(departure) {
        if (departure.mode) {
            return departure.mode;
        }

        /* Régi Worker: nincs "mode" mező, a megálló / járat nevéből derül ki. */
        if (/^H\d/.test(String(departure.route)) ||
            String(departure.stop).indexOf("Mátyásföld") === 0) {
            return "hev";
        }

        return "bus";
    }

    function badgeStyle(departure) {
        var hex = /^[0-9a-fA-F]{6}$/;
        var background;
        var color;

        if (!hex.test(String(departure.color || ""))) {
            return { style: "", dark: false };
        }

        background = String(departure.color);
        color = hex.test(String(departure.textColor || "")) ?
            String(departure.textColor) : "ffffff";

        return {
            style: " style=\"background:#" + background + ";color:#" + color + "\"",
            dark: parseInt(background.substr(0, 2), 16) +
                parseInt(background.substr(2, 2), 16) +
                parseInt(background.substr(4, 2), 16) < 150
        };
    }

    function rowHtml(departure, index, now) {
        var minutes = Math.floor((departure.timestamp - now) / 60000);
        var badge = badgeStyle(departure);
        var departAt = departure.time || formatClock(departure.timestamp);
        var sub = "Indul " + departAt;
        var minsClass = "mins";
        var minsHtml;

        if (departure.arrival || departure.arrivalTime) {
            sub += " · otthon " +
                (departure.arrivalTime || formatClock(departure.arrival));
        }

        if (minutes <= 0) {
            minsClass += " is-now";
            minsHtml = "<span class=\"mins-num\">most</span>";
        } else if (minutes < 60) {
            minsHtml = "<span class=\"mins-num\">" + minutes + "</span>" +
                "<span class=\"mins-unit\">perc</span>";
        } else {
            minsClass += " is-clock";
            minsHtml = "<span class=\"mins-num\">" + escapeHtml(departAt) + "</span>";
        }

        return "<div class=\"row row-" + index + "\"><div class=\"row-in\">" +
            "<div class=\"badge" + (modeOf(departure) === "hev" ? " badge-hev" : "") +
            (badge.dark ? " is-dark" : "") + "\"" + badge.style + ">" +
            escapeHtml(departure.route) + "</div>" +
            "<div class=\"dest\">" +
            "<div class=\"dest-name\">" + escapeHtml(departure.destination) + "</div>" +
            "<div class=\"dest-sub\">" + escapeHtml(sub) + "</div>" +
            "</div>" +
            "<div class=\"" + minsClass + "\">" + minsHtml + "</div>" +
            "</div></div>";
    }

    function noteHtml(text, twoLines) {
        return "<div class=\"note" + (twoLines ? "" : " note-one") + "\">" +
            text + "</div>";
    }

    function renderList(elementId, mode) {
        var list = state.lists[state.dir];
        var now = serverNow();
        var upcoming = [];
        var html = "";
        var i;

        if (state.dir === "out" && state.legacy) {
            setHtml(elementId, noteHtml(
                "Ehhez az irányhoz frissíteni kell<br>a Cloudflare Workert.", true
            ));
            return;
        }

        if (!list) {
            setHtml(elementId, noteHtml(
                state.ok === false ? "BKK adat nem elérhető" : "BKK adatok betöltése…"
            ));
            return;
        }

        for (i = 0; i < list.length; i += 1) {
            if (modeOf(list[i]) === mode &&
                typeof list[i].timestamp === "number" &&
                list[i].timestamp > now - 20000) {
                upcoming.push(list[i]);
            }
        }

        upcoming.sort(function (a, b) {
            return a.timestamp - b.timestamp;
        });

        if (upcoming.length === 0) {
            setHtml(elementId, noteHtml(
                state.bkkError[state.dir] ? "BKK adat nem elérhető" :
                    (mode === "hev" ? "Nincs közelgő HÉV" : "Nincs közelgő buszjárat")
            ));
            return;
        }

        for (i = 0; i < upcoming.length && i < ROWS; i += 1) {
            html += rowHtml(upcoming[i], i, now);
        }

        setHtml(elementId, html);
    }

    function renderDepartures() {
        var labels = ROUTES[state.dir];

        setText("bus-from", labels.busFrom);
        setText("bus-to", labels.busTo);
        setText("hev-from", labels.hevFrom);
        setText("hev-to", labels.hevTo);

        setClass("btn-in", "switch-btn" + (state.dir === "in" ? " is-active" : ""));
        setClass("btn-out", "switch-btn" + (state.dir === "out" ? " is-active" : ""));

        renderList("bus-departures", "bus");
        renderList("hev-departures", "hev");
    }

    function renderStatus() {
        if (state.ok === null) {
            setClass("status-dot", "dot");
            setText("status-text", "Betöltés…");
            return;
        }

        if (state.ok) {
            setClass("status-dot", "dot is-ok");
            setText("status-text", "Élő adat · " + formatClock(state.lastOk));
            return;
        }

        setClass("status-dot", "dot is-bad");
        setText(
            "status-text",
            state.lastOk ?
                "Nincs kapcsolat · utolsó adat " + formatClock(state.lastOk) :
                "Nincs kapcsolat"
        );
    }


    /* ==========================================
       IDŐJÁRÁS
    ========================================== */

    function renderWeather(weather) {
        var icon = byId("weather-icon");
        var source = weatherIcon(weather.weatherCode, weather.isDay);

        if (icon && lastText["weather-icon"] !== source) {
            icon.src = source;
            icon.style.visibility = "visible";
            lastText["weather-icon"] = source;
        }

        setText("temperature", weather.temperature + "°");
        setText("weather-description", weatherText(weather.weatherCode));
        setText("weather-range", weather.min + "° – " + weather.max + "°");
        setText("rain-chance", weather.rainChance + "%");
        setText("sunrise", timeFromIso(weather.sunrise));
        setText("sunset", timeFromIso(weather.sunset));
    }


    /* ==========================================
       SZÜLETÉSNAP
    ========================================== */

    function renderBirthday(birthday) {
        if (!birthday) {
            setClass("birthdays", "today-value is-empty");
            setText("birthdays", "Nincs ma születésnap");
            return;
        }

        setClass("birthdays", "today-value is-party");
        setText("birthdays", String(birthday));
    }


    /* ==========================================
       NÉVNAP
    ========================================== */

    function renderNamedays() {
        var now = displayNow();
        var month;
        var today;
        var names;

        if (!state.namedays) {
            return;
        }

        month = state.namedays[String(now.getMonth() + 1)];
        today = month && month[String(now.getDate())];
        names = today && today.main;

        if (!names || !names.length) {
            setClass("namedays", "today-value is-empty");
            setText("namedays", "Nincs adat");
            return;
        }

        setClass("namedays", "today-value");
        setText("namedays", names.join(", "));
    }

    function loadNamedays() {
        if (state.namedays || state.namedaysLoading) {
            return;
        }

        state.namedaysLoading = true;

        getJSON("nevnapok.json", function (error, data) {
            state.namedaysLoading = false;

            if (error || !data) {
                setClass("namedays", "today-value is-empty");
                setText("namedays", "Névnap adat nem elérhető");
                return;
            }

            state.namedays = data;
            renderNamedays();
        });
    }


    /* ==========================================
       ADATOK BETÖLTÉSE
    ========================================== */

    function loadDashboard() {
        var dir = state.dir;
        var url = withParam(API_URL, "dir", dir);

        /* A "t" paraméter a régi böngészők túlbuzgó gyorsítótára miatt kell. */
        url = withParam(url, "t", new Date().getTime());

        getJSON(url, function (error, data) {
            var answered;

            if (error || !data) {
                state.ok = false;

                /* Ha még sosem jött adat, ne maradjon kint a "Betöltés…". */
                if (!state.lastOk) {
                    setText("weather-description", "Nincs adat");
                    setClass("birthdays", "today-value is-empty");
                    setText("birthdays", "Nincs adat");
                }

                renderStatus();
                renderDepartures();
                return;
            }

            state.ok = true;
            state.lastOk = new Date().getTime();

            if (typeof data.timestamp === "number") {
                state.offset = data.timestamp - new Date().getTime();
                state.lastOk = data.timestamp;
            }

            state.legacy = !data.version;

            answered = data.direction === "out" ? "out" : "in";

            if (answered === "in" && data.departures) {
                state.lists["in"] = data.departures;
            }

            if (answered === "out" && data.outbound) {
                state.lists.out = data.outbound;
            }

            state.bkkError[answered] = !!data.bkkError;

            if (data.weather) {
                renderWeather(data.weather);
            }

            renderBirthday(data.birthday);
            renderStatus();
            renderClock();
            renderDepartures();
        });
    }

    function setDirection(dir) {
        if (state.dir === dir) {
            return;
        }

        state.dir = dir;
        saveDirection(dir);

        renderDepartures();
        loadDashboard();
    }


    /* ==========================================
       INDÍTÁS
    ========================================== */

    function tick() {
        var now = displayNow();

        renderClock();
        renderNamedays();

        /* Hajnalban egyszer újratöltjük az oldalt, hogy a mindig
           bekapcsolt tablet böngészője ne teljen be. */
        if (now.getHours() === 3 && now.getMinutes() === 30 &&
            new Date().getTime() - startedAt > 3600000) {
            window.location.reload();
        }
    }

    function refit() {
        if (window.bkkFit) {
            window.bkkFit();
        }
    }

    byId("btn-in").onclick = function () {
        setDirection("in");
    };

    byId("btn-out").onclick = function () {
        setDirection("out");
    };

    window.onresize = refit;

    window.onorientationchange = function () {
        refit();
        setTimeout(refit, 400);
    };

    setStaticIcons();
    renderClock();
    renderStatus();
    renderDepartures();

    loadNamedays();
    loadDashboard();

    setInterval(tick, 1000);
    setInterval(renderDepartures, 5000);
    setInterval(loadDashboard, REFRESH_MS);
    setInterval(loadNamedays, 600000);

})();
