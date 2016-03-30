// npm install node-oojs-utility -g
oojs.define({
    name: 'buildSmart',
    namespace: 'oojs.command',
    deps: {
        fileSync: 'oojs.utility.fileSync',
        jsHelper: 'oojs.utility.jsHelper',
        gzip: 'oojs.utility.gzip',
        analyse: 'oojs.utility.analyse',
        lang: 'oojs.utility.lang'
    },
    // 所有类的名字集合
    classNameArray: [],

    $buildSmart: function () {
        this.fs = require('fs');
        this.path = require('path');
        this.md5 = require('md5');
    },

    buildSmart: function (args) {
        this.config = args ? (args.config || './package.json'): './package.json';
        this.configPath = this.path.resolve(this.config);
        this.target = args ? args.target: undefined;
    },

    run: function () {
        var packageObj = require(this.configPath);
        var buildObj = packageObj.build;
        this.buildObj = buildObj;
        if (this.target) {
            this.buildItem(buildObj[this.target]);
            return;
        }
    },

    /**
     * 解析导入命令模式，目前支持：
     * $import(); // 单个导入
     * $importAll(); // 导入全部依赖
     * $split(); // 导入，把所有依赖文件合并后成独立js文件
     * $replace(); // 替换导入
     *
     * @param {string} template 打包模板文件
     * @param {string} type 导入类型
     */
    parseImportToken: function (template, type) {
        // 待导入文件记录,用对象记录方便去重
        var result = [];
        var regexp = new RegExp('\\$' + type + '\\((\\S+)\\)\\s*;', 'gi');
        // 处理import命令, 只引用当前类
        template.replace(
            regexp,
            function () {
                var importFilePath = arguments[1];
                importFilePath = importFilePath.replace(/\'/gi, '').replace(/\"/gi, '');
                result.push(importFilePath);
            }.proxy(this)
        );
        return result;
    },

    parseReplaceToken: function (template) {
        // 待导入文件记录,用对象记录方便去重
        var result = [];

        var regexp = /\$replace\((\S+),\s*(\S+)\)\s*;/gi;
        // 处理import命令, 只引用当前类
        template.replace(
            regexp,
            function () {
                var importFilePath = arguments[1];
                importFilePath = importFilePath.replace(/\'/gi, '').replace(/\"/gi, '');

                var targetImportFilePath = arguments[2];
                targetImportFilePath = targetImportFilePath.replace(/\'/gi, '').replace(/\"/gi, '');

                result.push({
                    target: importFilePath,
                    value: targetImportFilePath
                });
                return '';
            }.proxy(this)
        );
        return result;
    },

    replaceReplaceImport: function (template) {
        var regexp = /\$replace\((\S+),\s*(\S+)\)\s*;/gi;
        // 处理import命令, 只引用当前类
        return template.replace(
            regexp,
            function () {
                //var importFilePath = arguments[1];
                //importFilePath = importFilePath.replace(/\'/gi, '').replace(/\"/gi, '');
                return '';
            }.proxy(this)
        );
    },

    replaceSingleImport: function (template, record) {
        var regexp = new RegExp('\\$import\\((\\S+)\\)\\s*;', 'gi');
        // 处理import命令, 只引用当前类
        return template.replace(
            regexp,
            function () {
                var importFilePath = arguments[1];
                importFilePath = importFilePath.replace(/\'/gi, '').replace(/\"/gi, '');
                var fileModel = record[importFilePath];
                var sourceCode = fileModel.source || '';
                sourceCode += '\n';
                return (fileModel && fileModel.source) || '';
            }.proxy(this)
        );
    },

    replaceAllImport: function (template, record, list) {
        var regexp = new RegExp('\\$importAll\\((\\S+)\\)\\s*;', 'gi');
        // 处理import命令, 只引用当前类
        return template.replace(
            regexp,
            function () {
                var importFilePath = arguments[1];
                importFilePath = importFilePath.replace(/\'/gi, '').replace(/\"/gi, '');
                var sourceCode = '';
                while (list.length > 0) {
                    var fullname = list.shift();
                    var fileModel = record[fullname];
                    sourceCode += fileModel.source || '';
                    sourceCode += '\n';
                    if (importFilePath === fullname) {
                        return sourceCode;
                    }
                }

                return sourceCode;
            }.proxy(this)
        );
    },

    /**
     * 针对配置的构建item编译脚本
     *
     * @param {Object} item
     * @param {string} item.template 编译模板文件配置
     * @param {string} item.sourceFile 编译出源文件地址
     * @param {string} item.formatFile 带格式去注释文件地址
     * @param {string} item.compressFile 压缩后文件地址
     * @param {string} item.gzipFile gzip压缩文件地址
     */
    buildItem: function (item) {
        var buildItemStartTimestamp = +new Date;
        var SINGLE_IMPORT = 'import';
        var ALL_IMPORT = 'importAll';
        var SPLITE_IMPORT = 'split';
        var REPLACE_IMPORT = 'replace';

        // 编译模板
        var templateSource = this.fileSync.readFileSync('' + item.template);

        var singleImportList = this.parseImportToken(templateSource, SINGLE_IMPORT);
        var allImportList = this.parseImportToken(templateSource, ALL_IMPORT);
        var splitList = this.parseImportToken(templateSource, SPLITE_IMPORT);
        var replaceList = this.parseReplaceToken(templateSource);

        // 主体部分导入记录
        var allRecord = {};
        // 拆分出来独立打包的记录
        var splitRecordMap = {};
        var i = 0;
        var count = 0;

        // 处理单个加载的
        for (i = 0, count = singleImportList.length; i < count; i++) {
            var clsFullName = singleImportList[i];
            allRecord[clsFullName] = this.analyse.parseCls(clsFullName);
        }

        // 处理需依赖加载的
        for (i = 0, count = allImportList.length; i < count; i++) {
            this.analyse.analyzeAllDeps(allImportList[i], allRecord, null, replaceList);
        }

        // 处理split
        for (i = 0, count = splitList.length; i < count; i++) {
            var clsFullName = splitList[i];
            if (allRecord[clsFullName]) {
                console.log('[WARNING] ' + clsFullName + ' has imported!');
            }
            else {
                var record = {};
                this.analyse.analyzeAllDeps(splitList[i], record, allRecord, null);
                splitRecordMap[clsFullName] = record;
            }
        }

        // 检查是否存在循环依赖
        //var isCircle = false;
        //var badSnakeList = [];
        //for (var clsName in allRecord) {
        //    var result = this.analyse.checkDepsCircle(clsName, null, null, allRecord);
        //    if (result) {
        //        isCircle = true;
        //        badSnakeList.push(clsName);
        //    }
        //}
        //
        //if (isCircle) {
        //    console.log('存在循环依赖，请解环');
        //    console.log(badSnakeList);
        //    return;
        //}

        var temp = this.lang.deepCopyObject(allRecord);
        //console.log(temp['adserv.bridge.jsBridge']);
        var sortedAllDependsList = this.analyse.sortDeps(temp);
        console.log('--------排序后---------');
        console.log(sortedAllDependsList);
        console.log('---------EOF------------');

        var sourceCode = '';
        sourceCode = this.replaceReplaceImport(templateSource);
        sourceCode = this.replaceSingleImport(sourceCode, allRecord);
        sourceCode = this.replaceAllImport(sourceCode, allRecord, sortedAllDependsList);

        this.fs.writeFileSync(item.sourceFile + '', sourceCode);

        var formatSouceCode = this.jsHelper.formatSync(
            sourceCode,
            {
                comments: false
            }
        );
        this.fs.writeFileSync(item.formatFile + '', formatSouceCode);

        var compressStr = this.jsHelper.compressSync(formatSouceCode);
        this.fs.writeFileSync(item.compressFile + '', compressStr);

        this.gzip.zipStringToFileSync(item.gzipFile + '', compressStr);


        //for (var key in splitRecordMap) {
        //    if (!key || !splitRecordMap[key] || !splitRecordMap.hasOwnProperty(key)) {
        //        continue;
        //    }
        //
        //    var splitMap = splitRecordMap[key];
        //    var temp = this.lang.deepCopyObject(splitMap);
        //    var list = this.analyse.sortDeps(null, temp);
        //}

        console.log('First build totally cost', +new Date - buildItemStartTimestamp, 'ms');
    }
});
