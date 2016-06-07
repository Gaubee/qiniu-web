/**
 * Created by YUK on 16/6/3.
 */
/**
 * Created by YUK on 14-9-2.
 */

var express = require('express');
var router = express.Router();
var config = require('./../config');
var request = require('request');

var qiniu = require('./../controller/qiniu');
var _qiniu = qiniu.qiniu;

var client = new _qiniu.rs.Client();
const QINIU_REDRESH_CODE = {
    200: "成功加入队列",
    400031: "存在无效的url",
    400032: "存在无效的host",
    400033: "预取url数达到限额",
    400034: "刷新url数达到限额",
    400036: "无效的请求id",
    400037: "url已经被加入刷新队列",
    500000: "七牛服务端内部错误",
    500002: "服务端插入数据错误",
    500005: "服务端查询数据错误",
    500010: "服务端查询域名列表错误",
}
router.get('/', function(req, res) {
    res.render("index.html")
});

router.get('/api/token', function(req, res) {
    var bucket =  req.query.bucket;
    var key =  req.query.key;
    res.send({
        token : qiniu.uptoken(bucket, key)
    })
});


router.get('/api/list',  function(req, res, next) {
    var bucket =  req.query.bucket;
    var prefix =  req.query.prefix;
    var marker =  req.query.marker || '';

    _qiniu.rsf.listPrefix(bucket, prefix , marker, null/*limit*/, '/', function(err, ret) {
        if (!err) {
            // process ret.marker & ret.items           delimiter
            // console.log(ret.items)
            ret.items.sort(function(a,b){
                return a.putTime < b.putTime ? 1:-1;
            });

            res.send({
                success: true,
                ret: ret,
                domain: config.qiniu.domain[bucket],
                length: ret.items.length,
                prefix: prefix});

        } else {
            res.send({ success: false });
            // http://developer.qiniu.com/docs/v6/api/reference/rs/list.html
        }
    });
});


//删除单个文件
router.delete('/api/delete', function(req, res) {
    var bucket =  req.body.bucket;
    var key = req.body.key;

    client.remove(bucket, key, function(err, ret) {
        if (!err) {
            // ok
            res.send({ code: 100, ret: ret});
        } else {
            console.log(err);
            res.send({ code: 403});
            // http://developer.qiniu.com/docs/v6/api/reference/codes.html
        }
    });
});

//批量删除
router.delete('/api/batchdelete',   function(req, res) {
    var bucket =  req.body.bucket;
    var deleteKeys = req.body.keys;
    var deleteKeysPath = [];
    if(deleteKeys.length == 0){
        return  res.send({ code: 201 });
    }
    for(var i=0; i < deleteKeys.length; i++){
        deleteKeysPath.push(new _qiniu.rs.EntryPath(bucket, deleteKeys[i]));
    }
    client.batchDelete(deleteKeysPath, function(err, ret) {
        if (!err) {
            for (i in ret) {
                if (ret[i].code !== 200) {
                    // parse error code
                    return res.send({ code: 200, ret: ret});
                    // http://developer.qiniu.com/docs/v6/api/reference/codes.html
                }
                return res.send({ code: 100, ret: ret});
            }
        } else {
            return res.send({ code: 403});
            // http://developer.qiniu.com/docs/v6/api/reference/codes.html
        }
    });

});

//移动文件
router.put('/api/move',  function(req, res) {
    var bucket =  req.body.bucket;
    var bucketDest = req.body.bucketDest;
    var keyDest = req.body.keyDest;
    var key = req.body.key;

    client.move(bucket, key,bucketDest, keyDest, function(err, ret) {
        if (!err) {
            res.send({ code: 100, ret: ret});
        } else {
            res.send({ code: 403});
            // http://developer.qiniu.com/docs/v6/api/reference/codes.html
        }
    });

});

router.put('/api/batchmove/',function(req, res) {
    var bucket =  req.body.bucket;
    var bucketDest = req.body.bucketDest;
    var keys = req.body.keys;

    var keysPathPair = [];
    if(keys.length == 0){
        return  res.send({ code: 201 });
    }
    for(var i=0; i < keys.length; i++){
        keysPathPair.push(new _qiniu.rs.EntryPathPair( new _qiniu.rs.EntryPath(bucket, keys[i][0]), new _qiniu.rs.EntryPath(bucket, keys[i][1]) ));
    }

    client.batchMove(keysPathPair, function(err, ret) {
        if (!err) {
            for (i in ret) {
                if (ret[i].code !== 200) {
                    // parse error code
                    return res.send({ code: 200, ret: ret});
                    // http://developer.qiniu.com/docs/v6/api/reference/codes.html
                }
            }


            return res.send({ code: 100, ret: ret});
        } else {
            return res.send({ code: 403});
            // http://developer.qiniu.com/docs/v6/api/reference/codes.html
        }
    });


});

//刷新缓存
router.post('/api/refresh', function(req, res, next) {

    var urls = req.body.urls;
    request.post({
        url: 'http://fusion.qiniuapi.com/refresh',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'QBox '+ qiniu.getAccessToken('/refresh')
        },
        json: {
            urls: urls
        }
    }, function(err, response, body) {
        if(err){
            return next(err);
        }
        res.send({
            code: body.code,
            msg: QINIU_REDRESH_CODE[body.code]
        });

    });

});

module.exports = router;
