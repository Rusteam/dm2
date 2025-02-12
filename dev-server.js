const WebpackDevServer = require('webpack-dev-server');
const webpack = require('webpack');

const config = require('./webpack.config-builder')({
  withDevServer: true
});

const port = 5000;

config.entry.entry.unshift(
  `webpack-dev-server/client?http://localhost:${port}/`,
  `webpack/hot/dev-server`
);

const compiler = webpack(config);
const server = new WebpackDevServer(compiler, config.devServer);

server.listen(port, 'localhost', () => {
  console.log(`dev server listening on port ${port}`);
});
