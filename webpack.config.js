const path = require('path');

module.exports = {
  mode: 'production',
  entry: './dist/index.js',
  resolve: {
    fallback: {
      zlib: false,
    },
  },
  output: {
    filename: 'pensdk.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'PenSDK',
      type: 'umd',
    },
    globalObject: 'this',
  },
  module: {
    rules: [
      {
        test: /\.nproj$/,
        type: 'asset/source',
      },
      { 
        test: /\.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['@babel/plugin-proposal-class-properties']
          }
        }
      }
    ]
  }
};
