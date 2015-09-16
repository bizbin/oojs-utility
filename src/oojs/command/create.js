oojs.define({
    name: 'create',
    namespace: 'oojs.command',
    deps: {
        string: 'oojs.utility.string'
    },
    $create: function () {
        this.fs = require('fs');
        this.path = require('path');
        this.childProcess = require('child_process');
    },

    create: function (args) {
        this.clsFullName = args.name;
        this.author = args.author || '';
        this.email = args.email || '';
    },

    validate: function () {

    },

    /**
     * 获取git配置的
     *
     */
    getGitInfo: function () {
        this.childProcess.exec(
            'git --version',
            null,
            function (error, stdout, stderr) {
                if (!stdout) {
                    this.childProcess.exec('git config --global user.name', null, function (error, stdout, stderr) {
                       this.author =  stdout;
                    });
                    this.childProcess.exec('git config --global user.email', null, function (error, stdout, stderr) {
                        this.email =  stdout;
                    });
                }
            }
        );
    },

    run: function () {
        //this.getGitInfo();
        //return;
        var currentPath = process.cwd();

        var clsPathList = this.clsFullName.split('.');
        if (clsPathList.length === 0) {
            console.log('完整类名非法，请重新输入');
            return;
        }

        var clsName = clsPathList.pop();
        var clsNameSpace = clsPathList.join('.');

        var clsFilePath = clsPathList.join(this.path.sep);
        var clsFileName = clsName + '.js';
        var clsFileFullPath = currentPath
            + this.path.sep + 'src'
            + this.path.sep + clsFilePath;

        var tempFilePath = this.path.join(__dirname, '../../classTemp.temp');
        var tempSource = this.fs.readFileSync(tempFilePath, 'utf8');


        var authorInfo = '';
        if (this.author) {
            authorInfo += '@author ' + this.author;
        }
        if (this.email) {
            authorInfo += ' (' + this.email + ')';
        }

        var classFileData = {
            filePath: clsFilePath,
            authorInfo: authorInfo,
            className: clsName,
            classNamespace: clsNameSpace
        };
        var classFileContent = this.string.template(tempSource, classFileData);

        if (!this.fs.existsSync(clsFileFullPath + this.path.sep + clsFileName)) {

            if (!this.fs.existsSync(clsFileFullPath)) {
                this.fs.mkdirSync(clsFileFullPath);
            }

            this.fs.writeFileSync(clsFileFullPath + this.path.sep + clsFileName, classFileContent);

            console.log(clsFilePath + ' 创建成功');
            console.log(classFileContent);
        }
        else {
            console.log(clsFilePath + ' 已存在，创建会覆盖原有');
        }
    }

});
