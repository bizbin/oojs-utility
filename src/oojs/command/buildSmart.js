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
    // 待加载类的集合
    prepareloadArray: [],
    // 待加载的依赖类集合
    prepareDepsArray: [],
    $buildSmart: function () {
        this.fs = require('fs');
        this.path = require('path');
        this.md5 = require('md5');
        // 所有模块源码缓存
        this.cache = {};
        // 总控依赖的所有**打包用的**模块（有序）
        this.allDepsList = [];
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
        this.buildSwitch();
    },
    buildTotally: function (item) {
        //处理source文件
        this.buildSourceFile(item.sourceFile)
        //处理format文件
        var formatString = this.buildFormatFile(item.formatFile);
        // 处理compress文件
        var compressStr = this.buildCompressFile(item.compressFile, formatString);
        // 处理gzip文件
        this.buildGzipFile(item.gzipFile, compressStr);
    },
    _build: function (filePathArr, format) {
        var totalStr = '';
        var  importWithDepsRegexp = /\$importAll\((\S+)\)\s*;/gi;

        totalStr = this.originSourceFileString.replace(importWithDepsRegexp, function () {
            var  sourceCode = '';
            for (var j = 0; j < this.allDepsList.length;j++) {
                var clsName = this.allDepsList[j];
                var singleCache = this.cache[clsName];
                sourceCode += singleCache[format];
            }
            return sourceCode;
        }.proxy(this));

        for (var  i = 0, count = filePathArr.length; i < count; i++) {
            var  tempFilePath = filePathArr[i];
            this.fs.writeFileSync(tempFilePath, totalStr);
        }

        return totalStr;
    },
    /**
     * 编译源文件
     * @param filePathArr
     * @returns {*}
     */
    buildSourceFile: function (filePathArr) {
        return this._build(filePathArr, 'source');
    },
    /**
     * 构建去注释源文件
     * @param filePathArr
     * @returns {*}
     */
    buildFormatFile: function (filePathArr) {
        return this._build(filePathArr, 'format');
    },
    /**
     * 构建压缩文件
     * @param filePathArr
     * @param unCompressStr
     * @returns {*}
     */
    buildCompressFile: function (filePathArr, unCompressStr) {
        var compressStr = this.jsHelper.compressSync(unCompressStr);
        for (var  i = 0, count = filePathArr.length; i < count; i++) {
            var  tempFilePath = filePathArr[i];
            this.fs.writeFileSync(tempFilePath, compressStr);
        }
        return compressStr;
    },
    /**
     * 构建gzip压缩文件
     * @param filePathArr
     * @param compressStr
     */
    buildGzipFile: function (filePathArr, compressStr) {
        for (var  i = 0, count = filePathArr.length; i < count; i++) {
            var  tempGzipFilePath = filePathArr[i];
            this.gzip.zipStringToFileSync(tempGzipFilePath, compressStr);
        }
    },

    /**
     * 解析导入命令模式，目前支持：
     * $import(); // 单个导入
     * $importAll(); // 导入全部依赖
     * $split(); // 导入，把所有依赖文件合并后成独立js文件
     *
     * @param {string} template 打包模板文件
     */
    parseImportToken: function (template) {
        // 待导入文件记录,用对象记录方便去重
        var result = [];
        // 单个导入
        var tokenRegexp = /\$import\((\S+)\)\s*;/gi;
        // 处理import命令, 只引用当前类
        template.replace(
            tokenRegexp,
            function () {
                var importFilePath = arguments[1];
                importFilePath = importFilePath.replace(/\'/gi, '').replace(/\"/gi, '');
                result.push(importFilePath);
            }.proxy(this)
        );
        return result;
    },
    /**
     * 导入all
     * @param template
     * @return {Array}
     */
    parseImportAllToken: function (template) {
        // 待导入文件记录,用对象记录方便去重
        var result = [];
        // 导入所有依赖
        var tokenRegexp = /\$importAll\((\S+)\)\s*;/gi;
        // 处理import命令, 只引用当前类
        template.replace(
            tokenRegexp,
            function () {
                var importFilePath = arguments[1];
                importFilePath = importFilePath.replace(/\'/gi, '').replace(/\"/gi, '');
                result.push(importFilePath);
            }.proxy(this)
        );
        return result;
    },
    /**
     * 导入aplit
     *
     * @param template
     * @return {Array}
     */
    parseSplitToken: function (template) {
        // 待导入文件记录,用对象记录方便去重
        var importClsList = [];
        // 导入所有依赖
        var tokenRegexp = /\$split\((\S+)\)\s*;/gi;
        // 处理import命令, 只引用当前类
        template.replace(
            tokenRegexp,
            function () {
                var importFilePath = arguments[1];
                importFilePath = importFilePath.replace(/\'/gi, '').replace(/\"/gi, '');
                importClsList.push(importFilePath);
            }.proxy(this)
        );

        return importClsList;
    },
    /**
     * 解析源码
     * @param {string} 编译模板源文件
     * @param {Array} FileModel 列表
     */
    parseSourceFile: function (sourceTemplate, fileModelList) {
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

        // 编译模板
        var templateSource = this.fileSync.readFileSync('' + item.template);

        var singleImportList = this.parseImportToken(templateSource);
        var allImportList = this.parseImportAllToken(templateSource);
        var splitList = this.parseSplitToken(templateSource);

        var allRecord = {};
        var splitRecordMap = {};
        var i = 0;
        var count = 0;

        // 处理单个加载的
        for (i = 0, count = singleImportList.length; i < count; i++) {
            var clsFullName = singleImportList[i];
            // 处理oojs核心 module 引用
            if (clsFullName && clsFullName.indexOf('oojs') > -1) {
                allRecord[clsFullName] = this.analyse.parseCoreFile(clsFullName);
            }
            else {
                var filePath = oojs.getClassPath(clsFullName);
                var classData = this.analyse.analyzeCls(filePath);
            }
            allRecord[clsFullName] = classData;
        }

        // 处理需依赖加载的
        for (i = 0, count = allImportList.length; i < count; i++) {
            this.analyse.analyzeAllDeps(allImportList[i], allRecord);
        }

        // 处理split
        for (i = 0, count = splitList.length; i < count; i++) {
            var clsFullName = splitList[i];
            if (allRecord[clsFullName]) {
                console.log('[WARNING] ' + clsFullName + ' has imported!');
            }
            else {
                var record = {};
                this.analyse.analyzeAllDeps(splitList[i], record, allRecord);
                splitRecordMap[clsFullName] = record;
            }
        }

        var temp = this.lang.deepCopyObject(allRecord);
        var sortedAllDependsList = this.analyse.sortDeps(null, temp);

        for (var key in splitRecordMap) {
            if (!key || !splitRecordMap[key] || !splitRecordMap.hasOwnProperty(key)) {
                continue;
            }

            var splitMap = splitRecordMap[key];
            var temp = this.lang.deepCopyObject(splitMap);
            var list = this.analyse.sortDeps(null, temp);
        }

        // this.buildTotally(item);

        console.log('First build totally cost', +new Date - buildItemStartTimestamp, 'ms');
    }
});
