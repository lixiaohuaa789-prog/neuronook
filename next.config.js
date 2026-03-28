const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
	webpack(config) {
		config.resolve.alias = {
			...(config.resolve.alias || {}),
			"@/cosmograph/style.module.css": path.resolve(
				__dirname,
				"node_modules/@cosmograph/cosmograph/cosmograph/style.module.css.js"
			),
		};
		return config;
	},
};

module.exports = nextConfig;
