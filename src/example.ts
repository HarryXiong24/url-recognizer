import Parser from './main';

const urls: string[] = [];

const parser = new Parser({
  // threshold 可以指定一个数字，表示路径树的发散阈值；
  // 也可以指定一个数组，第一个元素表示路径树的发散阈值，第二个元素表示频率阈值，仅使用频率低于该阈值的路径进行运算；
  // 也可以指定一个函数，由函数动态返回threshold的值，函数接收原始的路径模式数组作为参数；
  threshold: 200, // [30, 1]

  // 动态参数特征，当指定这个参数时，会在路径树优化步骤完成后，继续使用特征识别的方法进行优化；
  // 可以是一个正则表达式或者判断函数，判断函数接受一个路径片段字符串作为参数，返回一个布尔值表示对应的字符串是否是动态参数；
  dynamicFeatures: [
    /^\d+$/,
    /(%[a-zA-Z\d]{2})+/,
    (word) => {
      /* 可以写一些判断逻辑 */ return true;
    },
  ],

  // 之前保存的已优化的URL分组数据，当指定该参数时，会在之前的基础上进行优化；
  initialGroupJSON: '',
});

// 调用update方法向解析器中添加url，该调用会同时触发解析，参数是一个url字符串数组。
parser.update(urls);

// 向控制台输出最终的解析结果
parser.print();

// 将已经解析后的结果序列化用于传输和保存
const groupJSON = parser.serializeGroup();
