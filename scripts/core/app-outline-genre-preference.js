(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || window.AppState;
    const Toast = window.ZHIYU_TOAST || { warn() {} };
    const Modal = window.ZHIYU_MODAL || { open() {}, close() {} };
    if (!AppState?.outline) throw new Error('Genre preferences require outline state.');

    const state = AppState.outline;
    const MALE_GENRES = window.OUTLINE_GENRES_MALE || [];
    const FEMALE_GENRES = window.OUTLINE_GENRES_FEMALE || [];
    const PROFILE_ROWS = [
        ['玄幻','围绕升级逆袭、资源争夺和势力扩张推进。','不要只堆等级设定或连续换地图。','成长体系、阶段敌人和代价必须清楚。','成长体系|主线赛道','主角穿越|有金手指|废柴开局|天才开局|宗门流|家族流|学院流|王朝争霸|血脉流|宠物流'],
        ['传统武侠','以江湖秩序、侠义选择和门派恩怨推动人物。','不要写成玄幻升级或只有武力碾压。','武功有边界，恩怨有因果，江湖与家国互相牵动。','主线赛道|冲突来源','架空历史|江湖群像|朝堂江湖|侠以武犯禁|侠之大者|门派恩怨|师徒传承|秘籍争夺|少年游侠'],
        ['仙侠','用修行、问道、因果和宗门纷争组织长线成长。','不要把修仙只写成数值升级。','境界、资源、心境和天道规则共同制约角色。','成长体系|主线赛道','修仙|宗门流|师徒传承|问道|渡劫|因果线|仙门群像|无女主'],
        ['西幻','围绕种族、教会、王国和魔法规则展开冒险。','不要照搬东方修仙称谓和升级方式。','种族文化、信仰冲突和力量代价要一致。','时代背景|成长体系','魔法学院|骑士|教会|王国战争|多种族|冒险小队|史诗群像|血脉'],
        ['都市','立足现代生活，以事业、身份和人际冲突推进。','不要让现实规则失效或无代价开挂。','职业细节、社会关系和生活质感要可信。','时代背景|主线赛道','神医|兵王|赘婿|重生创业|都市异能|商战|娱乐圈|校园都市|隐藏身份'],
        ['年代','用特定年代的生活条件、家庭与机会变化推动命运。','不要混用时代物价、制度和生活方式。','年代细节服务人物，不堆资料。','时代背景|冲突来源','年代创业|家长里短|知青|厂区生活|家庭群像|先婚后爱|发家致富'],
        ['历史','以制度、战争、生产和时代选择构成大格局。','不要随意挪用真实人物事件或让制度失真。','优先架空处理，权力和战争都有成本。','时代背景|冲突来源','架空历史|虚构王朝|寒门科举|朝堂权谋|皇子夺嫡|争霸|谋士|将军|战争边患|群像'],
        ['科幻','以技术变化及其代价推动社会与人物选择。','不要只换科技名词却沿用玄幻逻辑。','核心技术规则、限制和伦理后果必须稳定。','时代背景|成长体系','星际文明|机甲|赛博朋克|人工智能|末日科技|太空探索|文明冲突|硬科幻'],
        ['无限流','用连续副本检验能力、关系和长线秘密。','不要让副本互不相关或规则随意变化。','每个副本独立成环，也要推进总谜题。','结构模式|主线赛道','主神空间|惊悚副本|解谜副本|团队流|独狼流|直播副本|系统面板|长线阴谋'],
        ['游戏','围绕规则理解、成长路线和玩家关系推进。','不要把系统面板当成剧情本身。','玩法、版本和收益风险要形成选择。','成长体系|主线赛道','全息网游|游戏降临|职业玩家|公会争霸|隐藏职业|副本开荒|经营建设|团队群像'],
        ['电竞','以比赛、战队和职业成长作为事业主线。','不要只写感情或重复同一种比赛。','版本、战术、队友磨合和舆论压力要真实。','主线赛道|冲突来源','职业选手|战队重建|新人天才|老将回归|教练视角|版本理解|团队群像|舆论危机|恋爱副线|无恋爱'],
        ['体育','以训练、比赛和职业生涯推动成长。','不要无训练过程地连续破纪录。','项目规则、身体极限和团队关系必须可信。','主线赛道|成长体系','职业运动员|校园体育|国家队|伤病复出|教练视角|团队群像|竞技成长'],
        ['悬疑灵异','用线索、规则和未知威胁制造递进真相。','不要靠临时设定强行反转或只堆惊吓。','线索可回看，谜底可解释，规则前后一致。','氛围调味|冲突来源','规则怪谈|民俗悬疑|刑侦破案|灵异调查|单元案件|长线谜团|不可靠叙述'],
        ['军事军旅','以任务、纪律、协作和战争选择塑造人物。','不要娱乐化真实战争或映射敏感现实组织。','使用虚构战争与组织，行动逻辑保持专业。','主线赛道|冲突来源','虚构战争|虚构组织|军旅成长|特战小队|战争群像|家国线|战术行动'],
        ['二次元同人','围绕类型趣味和角色互动设计新冲突。','不要直接复制受保护作品内容或只靠梗推进。','优先原创世界与角色，保留圈层趣味。','氛围调味|结构模式','原创世界|轻小说风|校园社团|冒险小队|欢乐群像|日常流|热血成长'],
        ['现实纪实','从真实职业、家庭和社会处境中提炼冲突。','不要消费真实苦难或编造具体真实指控。','尊重常识和人物尊严，细节要可信。','时代背景|氛围调味','现实向|职业群像|家庭关系|小人物成长|社会议题|无金手指|慢热成长'],
        ['官场','以制度约束、利益博弈和责任选择推动成长。','不要映射现实人物组织或写成无规则碾压。','采用架空官场和虚构组织，程序与代价成立。','主线赛道|冲突来源','架空官场|基层成长|权谋博弈|秘书线|商政关系|朝堂斗争|虚构组织|无女主'],
        ['宫廷权谋','以生存、联盟和权力制衡推进关系变化。','不要只靠降智陷害或随意废立。','权力来源、礼制边界和阵营利益要明确。','时代背景|冲突来源','架空历史|虚构王朝|朝堂群像|后宫生存|女主重生|女主穿越|帝后博弈|女官线|公主线'],
        ['宅斗种田','从家庭关系、经营积累和日常选择推动成长。','不要让极品角色重复闹事或经营无成本。','家产、身份、生产和亲情变化要落地。','主线赛道|冲突来源','家族群像|种田经营|发家致富|宅斗|美食|养崽|先婚后爱|慢热成长'],
        ['架空古言','在虚构王朝中推进家国、婚恋和身份选择。','不要混乱礼制称谓或照搬真实朝代。','感情线与家族、朝堂利益互相影响。','时代背景|情感关系','架空历史|虚构王朝|家族群像|替嫁|先婚后爱|权臣|王爷|将军|双强|甜宠|虐恋'],
        ['仙侠言情','让修行目标、因果选择与感情成长并行。','不要用误会拖延全部剧情或让恋爱取代修行。','双方目标独立，关系变化影响修行和主线。','成长体系|情感关系','仙门群像|师徒情缘|前世今生|双强|追妻火葬场|救赎|因果线|单女主'],
        ['武侠言情','以江湖选择和人物关系共同推动成长。','不要把江湖写成恋爱布景或让武力无边界。','感情必须经受门派、道义和家国选择。','主线赛道|情感关系','架空历史|江湖群像|朝堂江湖|双强|师徒传承|门派恩怨|侠之大者|单女主'],
        ['总裁豪门','围绕阶层、事业、家族利益和亲密关系推进。','不要把控制、羞辱和违法行为无条件浪漫化。','双方目标独立，权力差带来真实后果。','时代背景|情感关系','豪门世家|契约婚姻|先婚后爱|职场线|双强|追妻火葬场|破镜重圆|甜宠'],
        ['都市职场','以职业成长、团队协作和现实关系推动故事。','不要让行业常识失真或把职场只写成恋爱场。','岗位、利益和晋升逻辑要可信。','时代背景|主线赛道','职场成长|创业|商战|行业群像|办公室恋情|双强|现实向'],
        ['校园言情','用成长、选择和同龄关系推进青春情感。','不要成人化未成年人关系或只靠误会拖延。','学业、家庭和自我认同与感情并行。','时代背景|情感关系','青春成长|学霸|青梅竹马|暗恋|双向奔赴|校园群像|无金手指'],
        ['娱乐圈','以作品、竞争、舆论和公众身份推动成长。','不要把成名写成无过程的热搜堆砌。','业务能力、团队合作和舆论后果要具体。','主线赛道|冲突来源','演员|歌手|选秀|经纪人|翻红|舆论危机|事业流|娱乐圈群像'],
        ['年代言情','在年代生活约束下推进家庭、事业和感情。','不要混用时代制度物价或直套现代观念。','关系选择受家庭、工作和生活条件影响。','时代背景|情感关系','年代创业|家属院|知青|先婚后爱|家庭群像|发家致富|甜宠'],
        ['古代重生','让前世经验改变古代处境、关系和权力选择。','不要让主角全知全能或重复复仇打脸。','改变历史会产生新变量和代价。','结构模式|时代背景','重生|架空历史|复仇|宅斗|朝堂权谋|改命|双强'],
        ['现代重生','用第二次机会重做事业、家庭和人生选择。','不要靠预知无限获利或忽略时代变化。','优势有限，选择改变会带来连锁反应。','结构模式|时代背景','重生|创业|弥补遗憾|复仇|家庭关系|事业流|无金手指'],
        ['穿书','围绕已知剧情、自我选择和角色命运偏移推进。','不要机械走原剧情或只靠吐槽原作。','剧情改变后必须出现新因果。','结构模式|冲突来源','穿书|改写命运|女配逆袭|恶毒女配|系统任务|救赎|剧情崩坏'],
        ['快穿','用多个世界完成不同任务并推进总目标。','不要让单元重复换皮或让主角没有成长。','每个世界独立闭环，同时积累长期变化。','结构模式|主线赛道','系统任务|单元世界|女配逆袭|虐渣|攻略|拯救|无CP任务|直播|万人迷'],
        ['西幻言情','在西式魔法与阶层冲突中推进双向成长。','不要只换外国名字却沿用古言逻辑。','种族、信仰和力量差异影响关系。','时代背景|情感关系','魔法学院|骑士与公主|多种族|教会|双强|宿敌恋人|救赎|史诗爱情'],
        ['灵异言情','让未知规则、调查和感情信任共同推进。','不要用灵异只制造误会或让规则随时失效。','关系发展必须通过共同面对真实危险。','氛围调味|情感关系','灵异调查|民俗悬疑|人鬼情缘|规则怪谈|救赎|单元事件|长线谜团'],
        ['末世言情','以生存、资源和团队选择检验亲密关系。','不要弱化生存压力或让感情取代危机。','能力、资源、基地和信任都有代价。','时代背景|情感关系','末世求生|基地建设|异能|囤货|团队群像|双强|空间|丧尸'],
        ['系统异能','以明确能力规则和任务代价推动现实成长。','不要让系统随时发奖或让能力没有边界。','任务、奖励、惩罚和异能限制必须稳定。','成长体系|结构模式','系统|异能|任务流|面板|都市异能|能力代价|升级|无感情线'],
        ['纯爱','以双主角关系、个人目标和共同困境推进。','不要用标签替代人物塑造或只写暧昧拉扯。','双方都有完整动机和成长线。','情感关系|主线赛道','双男主|双强|救赎|破镜重圆|事业流|校园|古风|无限流'],
        ['百合','以双女主关系、个人目标和共同选择推进。','不要将角色模板化或让感情脱离主线。','双方能力、欲望和成长都独立。','情感关系|主线赛道','双女主|双强|救赎|破镜重圆|事业流|校园|古风|无限流'],
        ['女尊','在清楚的社会规则下重构权力、事业和关系。','不要只颠倒性别刻板印象或让规则前后矛盾。','制度设定影响家庭、职业和冲突。','时代背景|情感关系','女尊世界|女帝|经商|科举|一对一|多男主|权谋|种田'],
        ['无CP','聚焦事业、冒险、亲情友情和自我成长。','不要暗写恋爱又回避关系定位。','核心情感来自伙伴、家人、师徒或群体。','情感关系|结构模式','事业流|群像|亲情友情|修仙|快穿|无限流|末世|现实向|无恋爱'],
        ['言情','让人物关系变化服务成长与主线推进。','不要只靠误会拖延或让感情吞没主线。','双方目标独立，关系变化有事件依据。','情感关系','单女主|单男主|双强|甜宠|虐恋|破镜重圆|追妻火葬场'],
        ['国风言情','以东方审美、家国秩序和人物关系共同推进。','不要只堆古风辞藻或混乱历史礼制。','优先架空，感情线与家族江湖朝堂互相作用。','时代背景|情感关系','架空历史|虚构王朝|家族群像|江湖群像|朝堂群像|双强'],
        ['武侠','以江湖秩序、侠义选择和门派恩怨推动人物。','不要写成玄幻升级或只有武力碾压。','武功有边界，恩怨有因果，江湖与家国互相牵动。','主线赛道|冲突来源','架空历史|江湖群像|朝堂江湖|侠以武犯禁|侠之大者|门派恩怨|师徒传承']
    ];
    const GENRE_PROFILES = Object.fromEntries(PROFILE_ROWS.map(row => [row[0], {
        direction: row[1], avoid: row[2], notes: row[3], roles: row[4].split('|'), tags: row[5].split('|')
    }]));
    const EXTRA_PROFILE_DEFINITIONS = [
        ['传统玄幻','玄幻','沿着清楚的修炼体系、宗门势力和主角成长铺开世界与冲突。','可把升级、历练、资源争夺和人物选择交替推进，让长线成长有层次。'],
        ['玄幻脑洞','玄幻','以一个鲜明的新规则、新能力或新世界切口带动玄幻成长。','先让脑洞进入人物处境，再通过事件逐步展示玩法和世界变化。'],
        ['战神赘婿','都市','从隐藏身份、家庭处境和强者回归切入都市逆袭。','可把身份揭示、事业行动和家庭关系并行推进，保持人物动机连贯。'],
        ['东方仙侠','仙侠','用东方修行、宗门传承、山海想象与因果选择组织冒险。','可让修行目标、世间关系和个人问道互相推动。'],
        ['都市修真','都市','把修真能力放进现代生活、职业关系和城市事件中展开。','可利用现代秩序与修行世界的交汇制造新鲜冲突和生活感。'],
        ['西方奇幻','西幻','围绕魔法、王国、种族、教会或冒险队展开奇幻旅程。','可从一个明确地域或任务出发，逐层打开更大的文明与势力图景。'],
        ['都市高武','玄幻','在现代城市与武道社会中推进训练、竞技、任务和成长。','可兼顾校园、职业、城市生活与武道体系，让升级落在具体事件上。'],
        ['都市脑洞','都市','用新身份、新规则或特殊能力重新解释熟悉的都市生活。','可让脑洞持续影响工作、人际和主线目标，形成稳定的故事玩法。'],
        ['都市种田','都市','从城市经营、社区生活、手艺或小生意中积累成长与关系。','可通过日常细节、经营变化和人物往来制造持续看点。'],
        ['都市日常','都市','聚焦现代人的工作、家庭、友情和细碎生活变化。','可用有温度的小事件串起人物成长，让平常生活自然产生起伏。'],
        ['科幻末世','科幻','从灾变后的科技、生存环境和社会重组中展开人物选择。','可让技术方案、资源分配、群体协作和个人目标共同推动故事。'],
        ['悬疑脑洞','悬疑灵异','以反常设定、特殊规则或独特视角打开谜题。','可让新奇设定服务线索推进，在逐步解答中不断产生新的理解。'],
        ['悬疑','悬疑灵异','围绕秘密、线索、调查和人物动机逐层接近真相。','可让每次发现同时改变人物判断和局势，使推理与剧情一起向前。'],
        ['灵异','悬疑灵异','用民俗、未知现象、特殊规则和人物经历营造神秘感。','可在氛围、调查与人物情感之间切换，让未知逐步显形。'],
        ['抗战谍战','军事军旅','围绕隐蔽行动、身份博弈、情报传递和时代选择展开。','可采用虚构人物与事件，通过任务压力和信任变化塑造群像。'],
        ['历史古代','历史','在古代社会、制度、战争、生产与人物命运中推进故事。','可从具体身份和时代机会切入，再逐步扩展家国与群体图景。'],
        ['年代历史','年代','以特定年代的生活变化、行业机会和家庭命运串联时代进程。','可让时代背景融入衣食住行、职业选择和人物关系。'],
        ['游戏体育','游戏','结合游戏规则、竞技训练、赛事目标和团队协作推进成长。','可让角色通过理解规则、磨合队伍和应对比赛压力形成阶段变化。'],
        ['游戏电竞','电竞','围绕职业比赛、战队运营、版本理解和选手成长展开。','可交替描写训练、赛事、团队关系和职业选择，形成事业主线。'],
        ['动漫衍生','二次元同人','从熟悉的动漫类型趣味或世界设定出发设计新的角色行动。','可保留类型气质，同时把主要冲突和人物成长写成独立的新故事。'],
        ['同人二创','二次元同人','基于读者熟悉的角色关系或世界切口展开新的情节可能。','可抓住原有吸引力，再用新的目标、选择和后果形成二次创作。'],
        ['女频悬疑','悬疑灵异','以女性视角、关系变化、生活处境和调查过程共同推进谜题。','可让破解真相与人物成长并行，使情感线也参与线索理解。'],
        ['古风世情','架空古言','从古风生活、家族人情、身份处境和世态变化展开人物命运。','可用细腻日常承载关系起伏，让个人选择映照更大的社会环境。'],
        ['古言脑洞','架空古言','在古代或架空背景中加入鲜明的新规则、新身份或剧情机制。','可让脑洞自然融入礼俗、家族和朝堂关系，持续影响人物选择。'],
        ['宫斗宅斗','宫廷权谋','在宫廷与家宅之间推进身份、生存、联盟和利益变化。','可通过日常细节、礼法场景和阵营选择展现关系博弈。'],
        ['玄幻言情','仙侠言情','让奇幻成长、世界冒险和双向关系变化共同组成主线。','可让双方各有目标，在共同经历中推动能力、信任与选择。'],
        ['民国言情','年代言情','在民国城市、家族、职业与时代变动中展开人物关系。','可让时代气息进入生活细节，使爱情与个人道路互相影响。'],
        ['种田','宅斗种田','从生活经营、生产积累、家庭协作和环境改善中获得成长。','可用季节、手艺、交易和日常关系形成稳定又有变化的节奏。'],
        ['青春甜宠','校园言情','用轻快互动、共同成长和生活小事件推进青春关系。','可把心动、友情、学业与家庭经历自然交织，保持人物各自的成长。'],
        ['现言脑洞','都市职场','在现代情感与生活背景中加入新身份、新规则或新奇关系切口。','可让脑洞持续影响事业、社交和关系选择，而不只是开场噱头。'],
        ['豪门总裁','总裁豪门','围绕事业、家族利益、身份差异和亲密关系推进故事。','可让双方都有清楚目标，通过合作、冲突与选择逐步改变关系。'],
        ['职场婚恋','都市职场','把职业发展、合作竞争与成年人的亲密关系放在同一条生活线上。','可让岗位变化、现实压力和情感选择相互作用。'],
        ['星光璀璨','娱乐圈','围绕作品、舞台、公众评价和个人成长书写闪耀历程。','可从一次机会或低谷起步，让业务能力与人物关系共同积累。'],
        ['女频衍生','二次元同人','从女性读者熟悉的类型元素、角色关系或世界切口发展新故事。','可保留情感吸引力，同时建立独立的目标、冲突和成长线。'],
        ['双男主','纯爱','以两位男主各自的目标、合作与关系变化共同推动故事。','可让两条人物线彼此照亮，在事件选择中形成默契或张力。'],
        ['双女主','百合','以两位女主的独立成长、共同目标和关系变化展开故事。','可让双方都拥有完整行动线，在合作与分歧中推进情节。'],
        ['无 CP','无CP','聚焦事业、冒险、亲情友情、伙伴关系或个人成长。','可把核心情感放在群体羁绊和人生选择上，自由决定故事重心。']
    ];
    EXTRA_PROFILE_DEFINITIONS.forEach(function(definition) {
        const name = definition[0];
        const base = GENRE_PROFILES[definition[1]] || {};
        GENRE_PROFILES[name] = {
            direction: definition[2],
            avoid: '',
            notes: definition[3],
            roles: Array.isArray(base.roles) ? base.roles.slice() : ['主线赛道'],
            tags: Array.isArray(base.tags) ? base.tags.slice() : []
        };
    });
    const COMMON_TAG_GROUPS = [
        { name: '主角来源', tags: ['本土主角','穿越','重生','穿书','转生','觉醒前世','失忆'] },
        { name: '金手指', tags: ['无金手指','系统','空间','血脉','面板','神秘传承','读心','预知','宠物','外挂记忆'] },
        { name: '感情结构', tags: ['无感情线','单女主','单男主','多女主','多男主','无CP','纯爱','百合','女尊','双强','追妻火葬场','破镜重圆'] },
        { name: '开局状态', tags: ['废柴开局','天才开局','被退婚','被背叛','家族没落','底层小人物','强者归来','身负秘密','身份被压制'] },
        { name: '爽点方式', tags: ['升级','打脸','复仇','经营','破案','权谋','救赎','争霸','求生','翻红','逆袭'] },
        { name: '叙事结构', tags: ['单主角','双主角','群像','单元副本','长线主线','地图流','日常流','快节奏爽文','慢热成长'] },
        { name: '安全处理', tags: ['架空历史','虚构王朝','虚构城市','虚构组织','弱化真实背景','虚构战争'] }
    ];
    const HISTORY_SAFETY_GENRES = ['历史','历史古代','年代历史','官场','传统武侠','武侠','武侠言情','宫廷权谋','宫斗宅斗','架空古言','军事军旅','抗战谍战','国风言情'];
    const ENSEMBLE_GENRES = ['传统武侠','武侠','武侠言情','宫廷权谋','宫斗宅斗','架空古言','古风世情','国风言情','东方仙侠','仙侠','仙侠言情','历史','历史古代','官场','宅斗种田'];

    function normalizeGenreList(genres) {
        const values = Array.isArray(genres) ? genres : String(genres || '').split(/[、,，/]/);
        return [...new Set(values.map(item => String(item || '').trim()).filter(Boolean))];
    }

    function getGenreRecommendedTags(genres) {
        const list = normalizeGenreList(genres);
        let tags = list.flatMap(genre => GENRE_PROFILES[genre]?.tags || []);
        if (list.some(genre => HISTORY_SAFETY_GENRES.includes(genre))) tags.push('架空历史','虚构王朝','弱化真实背景','朝堂江湖','虚构组织','虚构战争');
        if (list.some(genre => ENSEMBLE_GENRES.includes(genre))) tags.push('群像','江湖群像','朝堂群像','家族群像','门派群像');
        return [...new Set(tags)];
    }

    function getUniqueGenreTagColumns(genres) {
        const columns = normalizeGenreList(genres).slice(0, 3).map(genre => ({ genre, sourceTags: GENRE_PROFILES[genre]?.tags || [], tags: [] }));
        const owners = new Map();
        columns.forEach((column, index) => column.sourceTags.forEach(tag => owners.set(tag, [...(owners.get(tag) || []), index])));
        owners.forEach((indexes, tag) => {
            const target = indexes.reduce((best, current) => columns[current].tags.length < columns[best].tags.length ? current : best, indexes[0]);
            columns[target].tags.push(tag);
        });
        return columns.map(column => ({ genre: column.genre, tags: column.tags }));
    }

    function buildGenreFusionSummary(genres) {
        const list = normalizeGenreList(genres);
        if (list.length < 2) return '';
        const has = names => names.some(name => list.includes(name));
        if (has(['都市','都市日常','都市脑洞','都市职场','职场婚恋']) && has(['电竞','游戏电竞']) && has(['言情','校园言情','青春甜宠','纯爱','百合','双男主','双女主'])) return '融合建议：可用现代都市承载生活场景，以电竞事业推动外部事件，再让人物关系随比赛、团队和职业选择自然变化。';
        if (has(['历史','历史古代','年代历史']) && has(['官场']) && has(['传统武侠','武侠'])) return '融合建议：可让古代时代背景提供大局，官场线展开利益选择，武侠线承担行动与江湖气质。';
        const primary = list.find(genre => (GENRE_PROFILES[genre]?.roles || []).includes('主线赛道')) || list[0];
        const roles = list.map(genre => genre + '负责' + (GENRE_PROFILES[genre]?.roles || ['用户自定义方向']).slice(0, 2).join('、')).join('；');
        return '融合建议：' + roles + '。可以' + primary + '作为主要推进方向，其余题材按需要补充背景、关系、结构或冲突。';
    }

    function buildGenreContextPrompt(genres, selectedTags) {
        const list = normalizeGenreList(genres);
        const tags = normalizeGenreList(selectedTags);
        if (!list.length && !tags.length) return '';
        const lines = ['【题材写法参考】'];
        list.forEach(genre => {
            const profile = GENRE_PROFILES[genre];
            lines.push(profile
                ? '- ' + genre + '：' + profile.direction + ' ' + profile.notes
                : '- ' + genre + '：结合用户对该自定义题材的描述自由发挥。');
        });
        const fusion = buildGenreFusionSummary(list);
        if (fusion) lines.push(fusion);
        if (tags.length) lines.push('用户偏好标签：' + tags.join('、') + '。');
        lines.push('以上只是宽松的写法建议，优先服从用户的提示词模板、剧情梗概和自定义设定；可以自由取舍，不要求逐条使用，也不要原样输出标签。');
        return lines.join('\n');
    }

    function parseLeadingPreferenceTags(text) {
        const match = String(text || '').match(/^\s*((?:\[[^\]\n]{1,30}\]\s*)+)/);
        return match ? [...new Set(Array.from(match[1].matchAll(/\[([^\]\n]+)\]/g), item => item[1].trim()).filter(Boolean))] : [];
    }
    function stripLeadingPreferenceTags(text) { return String(text || '').replace(/^\s*(?:\[[^\]\n]{1,30}\]\s*)+(?:\r?\n\s*)*/, '').trim(); }
    function applyPreferenceTagsToSummary(text, tags) {
        const unique = normalizeGenreList(tags);
        const body = stripLeadingPreferenceTags(text);
        return unique.length ? unique.map(tag => '[' + tag + ']').join(' ') + (body ? '\n\n' + body : '\n\n') : body;
    }

    function getOutlineGenreMode(mode) {
        if (mode === 'function' || mode === 'advanced' || mode === 'normal') return mode;
        if ((window.getOutlineMode?.() || state.mode) === 'function') return 'function';
        return (window.getOutlineSubMode?.() || state.outlineSubMode) === 'advanced' ? 'advanced' : 'normal';
    }
    function getOutlineGenresForMode(mode) {
        const key = getOutlineGenreMode(mode);
        if (key === 'function') return Array.isArray(state.functionalGenres) ? state.functionalGenres : (state.functionalGenres = []);
        if (key === 'advanced') return Array.isArray(state.outlineAdvancedGenres) ? state.outlineAdvancedGenres : (state.outlineAdvancedGenres = []);
        return Array.isArray(state.genres) ? state.genres : (state.genres = []);
    }
    function inferGenreGender(genres, fallback) {
        const list = normalizeGenreList(genres);
        const maleCount = list.filter(function(genre) { return MALE_GENRES.includes(genre); }).length;
        const femaleCount = list.filter(function(genre) { return FEMALE_GENRES.includes(genre); }).length;
        if (maleCount > femaleCount) return 'male';
        if (femaleCount > maleCount) return 'female';
        return fallback === 'female' ? 'female' : 'male';
    }
    function persistBookGenres(genres, gender) {
        const bookName = String(AppState.chapter?.book || '').trim();
        if (!bookName || typeof window.gB !== 'function' || typeof window.sB !== 'function') return false;
        const books = window.gB() || {};
        const book = books[bookName];
        if (!book) return false;
        book.genres = normalizeGenreList(genres).slice(0, 3);
        book.genreGender = gender === 'female' ? 'female' : 'male';
        window.sB(books);
        return true;
    }
    function applyBookGenreDefaults(bookName) {
        const name = String(bookName || AppState.chapter?.book || '').trim();
        const books = typeof window.gB === 'function' ? window.gB() || {} : {};
        const book = books[name];
        const genres = normalizeGenreList(book?.genres || []).slice(0, 3);
        const savedGender = book?.genreGender === 'female'
            ? 'female'
            : (book?.genreGender === 'male' ? 'male' : '');
        const gender = savedGender || inferGenreGender(genres, 'male');
        state.genres = genres.slice();
        state.outlineAdvancedGenres = genres.slice();
        state.functionalGenres = genres.slice();
        state.genreGender = gender;
        state.functionalGenreGender = gender;
        return { genres: genres, gender: gender };
    }
    function setOutlineGenresForMode(mode, genres, options) {
        const list = normalizeGenreList(genres).slice(0, 3);
        const gender = inferGenreGender(list, state.genreGender);
        state.genres = list.slice();
        state.outlineAdvancedGenres = list.slice();
        state.functionalGenres = list.slice();
        state.genreGender = gender;
        state.functionalGenreGender = gender;
        if (options?.persist !== false) persistBookGenres(list, gender);
        return list;
    }
    function getOutlineCustomGenreState(mode) {
        const key = getOutlineGenreMode(mode);
        if (key === 'function') return state.functionSubject || '';
        return key === 'advanced' ? (state.outlineAdvancedCustomGenre || '') : (state.outlineNormalCustomGenre || '');
    }
    function setOutlineCustomGenreState(mode, value) {
        const key = getOutlineGenreMode(mode);
        const text = String(value || '').trim();
        if (key === 'function') state.functionSubject = text;
        else if (key === 'advanced') state.outlineAdvancedCustomGenre = text;
        else state.outlineNormalCustomGenre = text;
        return text;
    }
    function syncOutlineCustomGenreInputs(mode) {
        const key = getOutlineGenreMode(mode);
        const value = getOutlineCustomGenreState(key);
        [key === 'function' ? 'outlineFunctionSubject' : 'outlineAdvancedCustomGenre','outlineGenrePopupCustomInput'].forEach(id => {
            const input = document.getElementById(id);
            if (input && input.value !== value) input.value = value;
        });
    }
    function getOutlineCustomGenreInput(mode) {
        const key = getOutlineGenreMode(mode);
        const input = document.getElementById(key === 'function' ? 'outlineFunctionSubject' : 'outlineAdvancedCustomGenre') || document.getElementById('outlineGenrePopupCustomInput');
        const value = key === getOutlineGenreMode() && input ? input.value : getOutlineCustomGenreState(key);
        setOutlineCustomGenreState(key, value);
        syncOutlineCustomGenreInputs(key);
        return getOutlineCustomGenreState(key);
    }
    function getOutlineGenreList(mode) {
        const key = getOutlineGenreMode(mode);
        const custom = getOutlineCustomGenreInput(key);
        return normalizeGenreList(getOutlineGenresForMode(key).concat(custom ? [custom] : []));
    }

    function ensurePreferenceState() {
        if (!state.genrePreferenceTags) state.genrePreferenceTags = { normal: [], advanced: [], function: [] };
        if (!state.genrePreferenceAppliedGenres) state.genrePreferenceAppliedGenres = { normal: [], advanced: [], function: [] };
    }
    function getGenreTagContext() {
        const mode = window.getOutlineMode?.() || state.mode || 'outline';
        if (mode === 'function') {
            const subject = (document.getElementById('outlineFunctionSubject')?.value || state.functionSubject || '').trim();
            return { key: 'function', textareaId: 'outlineCoreSummary', genres: normalizeGenreList((state.functionalGenres || []).concat(subject ? [subject] : [])) };
        }
        const key = getOutlineGenreMode();
        return { key, textareaId: key === 'advanced' ? 'outlineAdvancedCoreSummary' : 'outlineCoreSummary', genres: getOutlineGenreList(key) };
    }
    function getGenrePreferenceTags(context, text) {
        ensurePreferenceState();
        const target = context || getGenreTagContext();
        const genreSet = new Set(target.genres.concat(state.genrePreferenceAppliedGenres[target.key] || []));
        const legacy = parseLeadingPreferenceTags(text);
        if (legacy.length) {
            state.genrePreferenceTags[target.key] = legacy.filter(tag => !genreSet.has(tag));
            state.genrePreferenceAppliedGenres[target.key] = target.genres.slice(0, 3);
        }
        state.genrePreferenceTags[target.key] = normalizeGenreList(state.genrePreferenceTags[target.key] || []).filter(tag => !genreSet.has(tag));
        return state.genrePreferenceTags[target.key];
    }

    let activeContext = null;
    let pendingTags = [];
    function makeButton(tag, selected, click) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'genre-preference-tag' + (selected ? ' selected' : '');
        button.textContent = tag;
        button.addEventListener('click', () => click(tag));
        return button;
    }
    function renderSummaryPreferenceChips(context) {
        const target = context || getGenreTagContext();
        const box = document.getElementById(target.key === 'advanced' ? 'outlineAdvancedSummarySelectedTags' : 'outlineSummarySelectedTags');
        const textarea = document.getElementById(target.textareaId);
        if (!box || !textarea) return;
        const tags = getGenrePreferenceTags(target, textarea.value);
        if (parseLeadingPreferenceTags(textarea.value).length) textarea.value = stripLeadingPreferenceTags(textarea.value);
        box.replaceChildren(...tags.map(tag => {
            const chip = document.createElement('span');
            chip.className = 'genre-summary-selected-tag';
            const label = document.createElement('span'); label.textContent = tag;
            const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'genre-summary-tag-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', '删除标签 ' + tag);
            remove.addEventListener('click', () => { state.genrePreferenceTags[target.key] = tags.filter(item => item !== tag); renderSummaryPreferenceChips(target); });
            chip.append(label, remove);
            return chip;
        }));
        syncGenreSummaryScrollHeight(textarea);
    }
    function syncGenreSummaryScrollHeight(textarea) {
        const target = textarea || document.getElementById(getGenreTagContext().textareaId);
        if (!target) return;
        target.style.height = 'auto';
        target.style.height = Math.max(120, target.scrollHeight) + 'px';
    }
    function renderGenrePreferenceTagModal() {
        if (!activeContext) return;
        const selectedBox = document.getElementById('genrePreferenceSelectedTags');
        const genreBox = document.getElementById('genrePreferenceSelectedGenres');
        const profileBox = document.getElementById('genrePreferenceProfileTags');
        const commonBox = document.getElementById('genrePreferenceCommonTags');
        if (!selectedBox || !genreBox || !profileBox || !commonBox) return;
        const toggle = tag => { pendingTags = pendingTags.includes(tag) ? pendingTags.filter(item => item !== tag) : pendingTags.concat(tag); renderGenrePreferenceTagModal(); };
        selectedBox.replaceChildren(...(pendingTags.length ? pendingTags.map(tag => makeButton(tag, true, toggle)) : [Object.assign(document.createElement('span'), { className: 'genre-preference-empty', textContent: '暂未选择' })]));
        const visibleGenres = activeContext.genres.slice(0, 3);
        genreBox.replaceChildren(...(visibleGenres.length ? visibleGenres.map(genre => Object.assign(document.createElement('span'), { className: 'genre-preference-genre-chip', textContent: genre })) : [Object.assign(document.createElement('span'), { className: 'genre-preference-empty', textContent: '未选择题材，仍可使用下方公共标签' })]));
        profileBox.replaceChildren(...getUniqueGenreTagColumns(visibleGenres).map(column => {
            const section = document.createElement('section'); section.className = 'genre-preference-profile-column';
            const title = document.createElement('h4'); title.textContent = column.genre;
            const list = document.createElement('div'); list.className = 'genre-preference-tag-list';
            list.append(...column.tags.map(tag => makeButton(tag, pendingTags.includes(tag), toggle)));
            section.append(title, list); return section;
        }));
        commonBox.replaceChildren(...COMMON_TAG_GROUPS.map(group => {
            const section = document.createElement('section'); section.className = 'genre-preference-common-group';
            const title = document.createElement('h4'); title.textContent = group.name;
            const list = document.createElement('div'); list.className = 'genre-preference-tag-list';
            list.append(...group.tags.map(tag => makeButton(tag, pendingTags.includes(tag), toggle)));
            section.append(title, list); return section;
        }));
    }
    function openGenrePreferenceTagModal() {
        activeContext = getGenreTagContext();
        const textarea = document.getElementById(activeContext.textareaId);
        pendingTags = getGenrePreferenceTags(activeContext, textarea?.value || '').slice();
        renderGenrePreferenceTagModal();
        Modal.open('genrePreferenceTagModal');
    }
    function confirmGenrePreferenceTags() {
        if (!activeContext) return;
        const textarea = document.getElementById(activeContext.textareaId);
        if (!textarea) return;
        ensurePreferenceState();
        state.genrePreferenceTags[activeContext.key] = pendingTags.slice();
        state.genrePreferenceAppliedGenres[activeContext.key] = activeContext.genres.slice(0, 3);
        const next = stripLeadingPreferenceTags(textarea.value); textarea.value = next;
        if (activeContext.key === 'function') state.functionalDirection = next.trim();
        else if (activeContext.key === 'advanced') state.outlineAdvancedCoreSummary = next.trim();
        else state.coreSummary = next.trim();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        Modal.close('genrePreferenceTagModal');
        renderSummaryPreferenceChips(activeContext);
        activeContext = null;
    }

    function renderOutlineSelectedGenreChips() {
        const mode = getOutlineGenreMode();
        const selected = getOutlineGenresForMode(mode);
        [mode === 'function' ? 'outlineFunctionSelectedGenreChips' : 'outlineSelectedGenreChips','outlinePopupSelectedGenreChips'].forEach(id => {
            const box = document.getElementById(id); if (!box) return;
            box.replaceChildren(...selected.map(genre => {
                const chip = document.createElement('span'); chip.className = 'outline-selected-genre';
                const label = document.createElement('span'); label.textContent = genre;
                const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.dataset.genre = genre;
                remove.addEventListener('click', event => { event.stopPropagation(); setOutlineGenresForMode(mode, selected.filter(item => item !== genre)); renderOutlineGenreTags(); renderSummaryPreferenceChips(); });
                chip.append(label, remove); return chip;
            }));
        });
    }
    function renderOutlineGenreTags() {
        const mode = getOutlineGenreMode();
        const selected = getOutlineGenresForMode(mode);
        const render = (id, genres) => {
            const box = document.getElementById(id); if (!box) return;
            box.replaceChildren(...genres.map(genre => {
                const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'genre-tag' + (selected.includes(genre) ? ' selected' : ''); tag.textContent = genre;
                tag.addEventListener('click', () => {
                    const current = getOutlineGenresForMode(mode);
                    if (!current.includes(genre) && current.length >= 3) return Toast.warn('男频和女频合计最多选择3个题材');
                    setOutlineGenresForMode(mode, current.includes(genre) ? current.filter(item => item !== genre) : current.concat(genre));
                    renderOutlineGenreTags(); renderSummaryPreferenceChips();
                }); return tag;
            }));
        };
        render('genreTagsMale', MALE_GENRES); render('genreTagsFemale', FEMALE_GENRES);
        const maleCount = document.getElementById('outlineMaleGenreCount'); if (maleCount) maleCount.textContent = '已选 ' + selected.filter(item => MALE_GENRES.includes(item)).length;
        const femaleCount = document.getElementById('outlineFemaleGenreCount'); if (femaleCount) femaleCount.textContent = '已选 ' + selected.filter(item => FEMALE_GENRES.includes(item)).length;
        renderOutlineSelectedGenreChips();
    }
    function setGenrePopupExpanded(expanded) {
        state.outlineGenreExpanded = !!expanded;
        const modal = document.getElementById('outlineModal'); if (modal) modal.dataset.genreExpanded = String(!!expanded);
        ['outlineGenreToggleBtn','outlineFunctionGenreToggleBtn'].forEach(id => {
            const button = document.getElementById(id); if (button) button.textContent = expanded ? '收起题材' : '添加题材';
        });
        if (!expanded) getOutlineCustomGenreInput();
    }
    function bindGenrePreferenceUi() {
        const popup = document.getElementById('outlineGenrePopup');
        const modalBox = document.getElementById('outlineModal')?.querySelector?.('.outline-modal-box');
        if (popup && modalBox && popup.parentElement !== modalBox) modalBox.appendChild(popup);
        ['outlineGenreToggleBtn','outlineFunctionGenreToggleBtn'].forEach(id => document.getElementById(id)?.addEventListener('click', event => { event.preventDefault(); setGenrePopupExpanded(!state.outlineGenreExpanded); renderOutlineGenreTags(); }));
        ['btnConfirmOutlineGenrePopup','btnCloseOutlineGenrePopup'].forEach(id => document.getElementById(id)?.addEventListener('click', () => setGenrePopupExpanded(false)));
        ['outlineAdvancedCustomGenre','outlineFunctionSubject','outlineGenrePopupCustomInput'].forEach(id => document.getElementById(id)?.addEventListener('input', function() { const mode = this.id === 'outlineFunctionSubject' ? 'function' : getOutlineGenreMode(); setOutlineCustomGenreState(mode, this.value); syncOutlineCustomGenreInputs(mode); renderSummaryPreferenceChips(); }));
        ['outlineCoreSummary','outlineAdvancedCoreSummary'].forEach(id => document.getElementById(id)?.addEventListener('input', function() { syncGenreSummaryScrollHeight(this); }));
        document.querySelectorAll('.genre-preference-add-btn').forEach(button => button.addEventListener('click', openGenrePreferenceTagModal));
        document.getElementById('btnConfirmGenrePreferenceTags')?.addEventListener('click', confirmGenrePreferenceTags);
        ['btnCancelGenrePreferenceTags','btnCloseGenrePreferenceTags'].forEach(id => document.getElementById(id)?.addEventListener('click', () => { Modal.close('genrePreferenceTagModal'); activeContext = null; }));
        document.querySelectorAll('#outlineSubModeTabs [data-submode], #outlineModeTabs [data-mode]').forEach(button => button.addEventListener('click', () => setTimeout(() => { setGenrePopupExpanded(false); syncOutlineCustomGenreInputs(); renderOutlineGenreTags(); renderSummaryPreferenceChips(); }, 0)));
        setGenrePopupExpanded(false); syncOutlineCustomGenreInputs(); renderOutlineGenreTags(); renderSummaryPreferenceChips();
    }

    Object.assign(window, {
        GENRE_PROFILES, normalizeGenreList, getGenreRecommendedTags, getUniqueGenreTagColumns, buildGenreFusionSummary,
        buildGenreContextPrompt, parseLeadingPreferenceTags, stripLeadingPreferenceTags, applyPreferenceTagsToSummary,
        getOutlineGenreMode, getOutlineGenresForMode, setOutlineGenresForMode, getOutlineCustomGenreState,
        inferGenreGender, persistBookGenres, applyBookGenreDefaults,
        setOutlineCustomGenreState, syncOutlineCustomGenreInputs, getOutlineCustomGenreInput, getOutlineGenreList,
        getGenreTagContext, getGenrePreferenceTags, renderSummaryPreferenceChips, syncGenreSummaryScrollHeight, openGenrePreferenceTagModal,
        confirmGenrePreferenceTags, renderOutlineSelectedGenreChips, renderOutlineGenreTags,
        ZHIYU_OUTLINE_GENRE_PREFERENCE_READY: true
    });
    bindGenrePreferenceUi();
    applyBookGenreDefaults(AppState.chapter?.book);
    renderOutlineGenreTags();
    renderSummaryPreferenceChips();
})(window);
