/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["**/*.{html,ts,css}"],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                primary: "#cc7d24",
                gray: "#555555",
                black: "#000000",
            },
        },
    },
    plugins: [],
};
