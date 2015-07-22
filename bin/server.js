var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var config = require('./../config/index');
var fs = require('fs');
var path = require('path');
var homeDirectory = config.homeDirectory || ".";
var requestHelper = require('./../app/requestHelper')

app.use('/designer/', express.static(__dirname + '/../public'));

io.set('transports', ['websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling', 'polling']);
io.set('origins', '*:*');

var folderResultFactory = function (dir, file) {
    return {
        path: path.resolve(dir, file),
        name: "/" + file,
        type: 'folder',
        children: []
    };
};

var fileResultFactory = function (dir, file) {
    return {
        path: path.resolve(dir, file),
        name: file,
        type: 'file'
    };
};

io.sockets.on('connection', function (socket) {
    requestHelper.listen(socket);

    requestHelper.on('directory', function (request) {
        var deferred = this;

        var walk = function (result, dir, done) {
            fs.readdir(dir, function (err, files) {
                if (err) return done(err);
                var pending = files.length;
                if (!pending) return done(null, result);

                files.forEach(function (file) {
                    var resolvedFile = path.resolve(dir, file);
                    fs.stat(resolvedFile, function (err, stat) {
                        if (stat && stat.isDirectory()) {
                            walk(folderResultFactory(dir, file), resolvedFile, function (err, res) {
                                if (err) return done(err);
                                result.children.push(res);
                                if (!--pending) done(null, result);
                            });
                        } else {
                            result.children.push(fileResultFactory(dir, file));
                            if (!--pending) done(null, result);
                        }
                    });
                });
            });
        };

        var result = folderResultFactory(request.path, '');
        walk(result, path.resolve(homeDirectory, '.' + request.path), function (err, results) {
            if (err) throw err;
            deferred.resolve(result);
        });

    });

    requestHelper.on('load', function (request) {
        var deferred = this;

        fs.readFile(path.resolve(request.path), function (err, data) {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(new Buffer(data, 'binary').toString('base64'));
            }
        });
    });

    requestHelper.on('save', function (file) {
        var deferred = this;

        fs.writeFile(file.path, new Buffer(file.content, 'base64').toString('binary'), function (err) {
            if (err) {
                console.log('File '+file.path+' could not be saved.');
                deferred.reject(err);
            } else {
                console.log('File '+file.path+' saved.');
                deferred.resolve({message: 'File '+file.path+' saved.'});
            }
        });
    });

});

server.listen(config.port);
