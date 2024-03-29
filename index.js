var instance_skel = require('../../instance_skel');
var tcp = require('../../tcp');
var debug;
var log;

var ok_pkt = Buffer.from([0x00, 0x08, 0x81, 0x09, 0x7e, 0x7e, 0x70, 0xff]);

var request_state;

var deviceAddress;


var IRIS = [
	{ id: '11', label: 'F1.8' },
	{ id: '10', label: 'F2.0' },
	{ id: '0F', label: 'F2.4' },
	{ id: '0E', label: 'F2.8' },
	{ id: '0D', label: 'F3.4' },
	{ id: '0C', label: 'F4.0' },
	{ id: '0B', label: 'F4.8' },
	{ id: '0A', label: 'F5.6' },
	{ id: '09', label: 'F6.8' },
	{ id: '08', label: 'F8.0' },
	{ id: '07', label: 'F9.6' },
	{ id: '06', label: 'F11' },
	{ id: '00', label: 'CLOSED' }
];

var SHUTTER = [
	{ id: '11', label: '1/1000000' },
	{ id: '10', label: '1/6000' },
	{ id: '0F', label: '1/4000' },
	{ id: '0E', label: '1/3000' },
	{ id: '0D', label: '1/2000' },
	{ id: '0C', label: '1/1500' },
	{ id: '0B', label: '1/1000' },
	{ id: '0A', label: '1/725' },
	{ id: '09', label: '1/500' },
	{ id: '08', label: '1/350' },
	{ id: '07', label: '1/250' },
	{ id: '06', label: '1/180' },
	{ id: '05', label: '1/125' },
	{ id: '04', label: '1/100' },
	{ id: '03', label: '1/90' },
	{ id: '02', label: '1/60' },
	{ id: '01', label: '1/30' }
];

var PRESET = [];
for (var i = 0; i < 64; ++i) {
	PRESET.push({ id: ('0' + i.toString(16)).substr(-2, 2), label: 'Preset ' + i });
}

var SPEED = [
	{ id: '01', label: 'Speed 01 (Slow)' },
	{ id: '02', label: 'Speed 02' },
	{ id: '03', label: 'Speed 03' },
	{ id: '04', label: 'Speed 04' },
	{ id: '05', label: 'Speed 05' },
	{ id: '06', label: 'Speed 06' },
	{ id: '07', label: 'Speed 07' },
	{ id: '08', label: 'Speed 08' },
	{ id: '09', label: 'Speed 09' },
	{ id: '0A', label: 'Speed 10' },
	{ id: '0B', label: 'Speed 11' },
	{ id: '0C', label: 'Speed 12' },
	{ id: '0D', label: 'Speed 13' },
	{ id: '0E', label: 'Speed 14' },
	{ id: '0F', label: 'Speed 15' },
	{ id: '10', label: 'Speed 16' },
	{ id: '11', label: 'Speed 17' },
	{ id: '12', label: 'Speed 18' },
	{ id: '13', label: 'Speed 19' },
	{ id: '14', label: 'Speed 20' },
	{ id: '15', label: 'Speed 21' },
	{ id: '16', label: 'Speed 22' },
	{ id: '17', label: 'Speed 23' },
	{ id: '18', label: 'Speed 24 (Fast)' },
];

var CHOICE_ZOOMSPEED = [
	{ id: '00', label: 'Speed 00 (Default)' },
	{ id: '01', label: 'Speed 01 (Slow)' },
	{ id: '02', label: 'Speed 02' },
	{ id: '03', label: 'Speed 03' },
	{ id: '04', label: 'Speed 04' },
	{ id: '05', label: 'Speed 05' },
	{ id: '06', label: 'Speed 06' },
	{ id: '07', label: 'Speed 07 (Fast)' },
];

function hex2str(hexdata) {
	var result = '';
	for (var i = 0; i < hexdata.length; i += 2) {
		result += String.fromCharCode(parseInt(hexdata.substr(i, 2), 16));
	}

	return result;
};

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	return self;
}

instance.prototype.init_tcp = function () {
	var self = this;


	if (self.tcp !== undefined) {
		self.tcp.destroy();
		delete self.tcp;
	}

	if (self.config.host !== undefined) {
		self.tcp = new tcp(self.config.host, self.config.port);

		self.deviceAddress = Buffer.alloc(1);
		self.deviceAddress.writeUInt8(self.config.deviceAddress + 128, 0);

		self.tcp.on('status_change', function (status, message) {
			self.status(status, message);
		});

		self.tcp.on('error', function (e) {
			debug('tcp error:', e.message);
		});

		self.tcp.on('data', function (data) {
			//Ignore the ok response
			if (!data.equals(ok_pkt)) {
				debug("Data from Datavideo VISCA: ", data);
			}
		});

		self.tcp.on('connect', () => {
			//Set slower zoom speed
			//var connect_packet = '\x01\x7e\x01\x0b\x7e\x02\xff';
			//self.sendVISCACommand(connect_packet);

			if (self.config.feedback) {
				request_state = setInterval(function () { self.requestState(); }, 1000);
			}
		});

		self.tcp.on('destroy', () => {
			clearInterval(request_state);
		});

		debug(self.tcp.host + ':' + self.config.port);
	}
};

instance.prototype.init = function () {
	var self = this;

	debug = self.debug;
	log = self.log;
	self.ptSpeed = '0C';
	self.ptSpeedIndex = 12;

	self.zoomSpeed = '07';
	self.zoomSpeedIndex = 7;

	self.status(self.STATUS_UNKNOWN);

	self.init_tcp();
	self.actions(); // export actions
	self.init_presets();
	self.setVariableDefinitions(self.getVariables());

	self.setVariable('pt_speed', self.ptSpeedIndex);
	self.setVariable('zoom_speed', self.zoomSpeedIndex);

};

instance.prototype.getVariables = function () {

	var variables = [
		{
			label: 'Pan/Tilt Speed',
			name: 'pt_speed'
		},
		{
			label: 'Zoom Speed',
			name: 'zoom_speed'
		},
	];

		return variables;
}

instance.prototype.updateConfig = function (config) {
	var self = this;
	self.config = config;

	clearInterval(request_state);

	if (self.tcp !== undefined) {
		self.tcp.destroy();
		delete self.tcp;
	}

	self.status(self.STATUS_UNKNOWN);

	if (self.config.host !== undefined) {
		self.init_tcp();
	}
};

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;

	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This module controls Datavideo PTZ cameras and heads with DVIP (Visca over IP) protocol'
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Camera IP',
			width: 6,
			regex: self.REGEX_IP
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'DVIP TCP port',
			width: 6,
			default: 5002,
			regex: self.REGEX_PORT
		},
		{
			type: 'number',
			id: 'deviceAddress',
			label: 'Device Address (1-7)',
			width: 6,
			default: 1,
			min: 1,
			max: 7,
		},
		{
			type: 'checkbox',
			id: 'feedback',
			label: 'Full Status Inquiry',
			default: '0',
		},
	]
};

// When module gets deleted
instance.prototype.destroy = function () {
	var self = this;

	clearInterval(request_state);

	if (self.tcp !== undefined) {

		self.tcp.destroy();
	}
	debug("destroy", self.id);
};

instance.prototype.init_presets = function () {
	var self = this;
	var presets = [
		{
			category: 'Pan/Tilt',
			label: 'UP',
			bank: {
				style: 'png',
				text: '',
				png64: image_up,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'up',
				}
			],
			release_actions: [
				{
					action: 'stop',
				}
			]
		},
		{
			category: 'Pan/Tilt',
			label: 'DOWN',
			bank: {
				style: 'png',
				text: '',
				png64: image_down,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'down',
				}
			],
			release_actions: [
				{
					action: 'stop',
				}
			]
		},
		{
			category: 'Pan/Tilt',
			label: 'LEFT',
			bank: {
				style: 'png',
				text: '',
				png64: image_left,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'left',
				}
			],
			release_actions: [
				{
					action: 'stop',
				}
			]
		},
		{
			category: 'Pan/Tilt',
			label: 'RIGHT',
			bank: {
				style: 'png',
				text: '',
				png64: image_right,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'right',
				}
			],
			release_actions: [
				{
					action: 'stop',
				}
			]
		},
		{
			category: 'Pan/Tilt',
			label: 'UP RIGHT',
			bank: {
				style: 'png',
				text: '',
				png64: image_up_right,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'upRight',
				}
			],
			release_actions: [
				{
					action: 'stop',
				}
			]
		},
		{
			category: 'Pan/Tilt',
			label: 'UP LEFT',
			bank: {
				style: 'png',
				text: '',
				png64: image_up_left,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'upLeft',
				}
			],
			release_actions: [
				{
					action: 'stop',
				}
			]
		},
		{
			category: 'Pan/Tilt',
			label: 'DOWN LEFT',
			bank: {
				style: 'png',
				text: '',
				png64: image_down_left,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'downLeft',
				}
			],
			release_actions: [
				{
					action: 'stop',
				}
			]
		},
		{
			category: 'Pan/Tilt',
			label: 'DOWN RIGHT',
			bank: {
				style: 'png',
				text: '',
				png64: image_down_right,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'downRight',
				}
			],
			release_actions: [
				{
					action: 'stop',
				}
			]
		},
		{
			category: 'Pan/Tilt',
			label: 'Home',
			bank: {
				style: 'text',
				text: 'HOME',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'home',
				}
			]
		},
		{
			category: 'Pan/Tilt',
			label: 'Speed Up',
			bank: {
				style: 'text',
				text: 'SPEED\\nUP',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'ptSpeedU',
				}
			]
		},
		{
			category: 'Pan/Tilt',
			label: 'Speed Down',
			bank: {
				style: 'text',
				text: 'SPEED\\nDOWN',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'ptSpeedD',
				}
			]
		},
		{
			category: 'Lens',
			label: 'Zoom In',
			bank: {
				style: 'text',
				text: 'ZOOM\\nIN',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'zoomI',
				}
			],
			release_actions: [
				{
					action: 'zoomS',
				}
			]
		},
		{
			category: 'Lens',
			label: 'Zoom Out',
			bank: {
				style: 'text',
				text: 'ZOOM\\nOUT',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'zoomO',
				}
			],
			release_actions: [
				{
					action: 'zoomS',
				}
			]
		},
		{
			category: 'Lens',
			label: 'Speed Up',
			bank: {
				style: 'text',
				text: 'Z SPEED\\nUP',
				size: '14',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'zoomSpeedU',
				}
			]
		},
		{
			category: 'Lens',
			label: 'Speed Down',
			bank: {
				style: 'text',
				text: 'Z SPEED\\nDOWN',
				size: '14',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [
				{
					action: 'zoomSpeedD',
				}
			]
		},
		{
			category: 'Lens',
			label: 'Focus Near',
			bank: {
				style: 'text',
				text: 'FOCUS\\nNEAR',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'focusN',
				}
			],
			release_actions: [
				{
					action: 'focusS',
				}
			]
		},
		{
			category: 'Lens',
			label: 'Focus Far',
			bank: {
				style: 'text',
				text: 'FOCUS\\nFAR',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'focusF',
				}
			],
			release_actions: [
				{
					action: 'focusS',
				}
			]
		},
		{
			category: 'Lens',
			label: 'Auto Focus',
			bank: {
				style: 'text',
				text: 'AUTO\\nFOCUS',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
				latch: true
			},
			actions: [
				{
					action: 'focusM',
					options: {
						bol: 0,
					}
				}
			],
			release_actions: [
				{
					action: 'focusM',
					options: {
						bol: 1,
					}
				}
			]
		},
		{
			category: 'Exposure',
			label: 'Exposure Mode',
			bank: {
				style: 'text',
				text: 'EXP\\nMODE',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
				latch: true
			},
			actions: [
				{
					action: 'expM',
					options: {
						bol: 0,
					}
				}
			],
			release_actions: [
				{
					action: 'expM',
					options: {
						bol: 1,
					}
				}
			]
		},
		{
			category: 'Exposure',
			label: 'Iris Up',
			bank: {
				style: 'text',
				text: 'IRIS\\nUP',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'irisU',
				}
			]
		},
		{
			category: 'Exposure',
			label: 'Iris Down',
			bank: {
				style: 'text',
				text: 'IRIS\\nDOWN',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'irisD',
				}
			]
		},
		{
			category: 'Exposure',
			label: 'Shutter Up',
			bank: {
				style: 'text',
				text: 'Shut\\nUP',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'shutU',
				}
			]
		},
		{
			category: 'Exposure',
			label: 'Shutter Down',
			bank: {
				style: 'text',
				text: 'Shut\\nDOWN',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'shutD',
				}
			]
		},
		{
			category: 'Tally',
			label: 'GREEN',
			bank: {
				style: 'text',
				text: 'GREEN',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 255, 0),
			},
			actions: [
				{
					action: 'tally',
					options: {
						val: 1,
					}
				}
			],
		},
		{
			category: 'Tally',
			label: 'RED',
			bank: {
				style: 'text',
				text: 'RED',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(255, 0, 0),
			},
			actions: [
				{
					action: 'tally',
					options: {
						val: 0,
					}
				}
			],
		},
		{
			category: 'Tally',
			label: 'OFF',
			bank: {
				style: 'text',
				text: 'OFF',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'tally',
					options: {
						val: 2,
					}
				}
			],
		},
		{
			category: 'OSD',
			label: 'OSD Menu',
			bank: {
				style: 'text',
				text: 'OSD',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
				latch: true,
			},
			actions: [
				{
					action: 'osd',
					options: {
						val: 0,
					}
				}
			],
			release_actions: [
				{
					action: 'osd',
					options: {
						val: 1,
					}
				}
			]
		},
		{
			category: 'OSD',
			label: 'ENTER',
			bank: {
				style: 'text',
				text: 'ENTER',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'osd',
					options: {
						val: 2,
					}
				}
			],
		},
		{
			category: 'OSD',
			label: 'BACK',
			bank: {
				style: 'text',
				text: 'BACK',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'osd',
					options: {
						val: 3,
					}
				}
			],
		},
		{
			category: 'OSD',
			label: 'UP',
			bank: {
				style: 'png',
				text: '',
				png64: image_up,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'osd',
					options: {
						val: 4,
					}
				}
			],
			release_actions: [
				{
					action: 'osd',
					options: {
						val: 8,
					}
				}
			]
		},
		{
			category: 'OSD',
			label: 'DOWN',
			bank: {
				style: 'png',
				text: '',
				png64: image_down,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'osd',
					options: {
						val: 5,
					}
				}
			],
			release_actions: [
				{
					action: 'osd',
					options: {
						val: 8,
					}
				}
			]
		},
		{
			category: 'OSD',
			label: 'LEFT',
			bank: {
				style: 'png',
				text: '',
				png64: image_left,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'osd',
					options: {
						val: 6,
					}
				}
			],
			release_actions: [
				{
					action: 'osd',
					options: {
						val: 8,
					}
				}
			]
		},
		{
			category: 'OSD',
			label: 'RIGHT',
			bank: {
				style: 'png',
				text: '',
				png64: image_right,
				pngalignment: 'center:center',
				size: '18',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'osd',
					options: {
						val: 7,
					}
				}
			],
			release_actions: [
				{
					action: 'osd',
					options: {
						val: 8,
					}
				}
			]
		},
	];

	var save;
	for (save = 0; save < 63; save++) {
		presets.push({
			category: 'Save Preset',
			label: 'Save Preset ' + parseInt(save + 1),
			bank: {
				style: 'text',
				text: 'SAVE\\nPSET\\n' + parseInt(save + 1),
				size: '14',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'savePset',
					options: {
						val: ('0' + save.toString(16).toUpperCase()).substr(-2, 2),
					}
				}
			]
		});
	}

	var recall;
	for (recall = 0; recall < 63; recall++) {
		presets.push({
			category: 'Recall Preset',
			label: 'Recall Preset ' + parseInt(recall + 1),
			bank: {
				style: 'text',
				text: 'Recall\\nPSET\\n' + parseInt(recall + 1),
				size: '14',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'recallPset',
					options: {
						val: ('0' + recall.toString(16).toUpperCase()).substr(-2, 2),
					}
				}
			]
		});
	}

	self.setPresetDefinitions(presets);
};


instance.prototype.actions = function (system) {
	var self = this;

	self.setActions({
		'left': { label: 'Pan Left' },
		'right': { label: 'Pan Right' },
		'up': { label: 'Tilt Up' },
		'down': { label: 'Tilt Down' },
		'upLeft': { label: 'Up Left' },
		'upRight': { label: 'Up Right' },
		'downLeft': { label: 'Down Left' },
		'downRight': { label: 'Down Right' },
		'stop': { label: 'P/T Stop' },
		'home': { label: 'P/T Home' },
		'ptSpeedS': {
			label: 'P/T Speed',
			options: [
				{
					type: 'dropdown',
					label: 'speed setting',
					id: 'speed',
					choices: SPEED
				}
			]
		},
		'ptSpeedU': { label: 'P/T Speed Up' },
		'ptSpeedD': { label: 'P/T Speed Down' },
		'ptSlow': {
			label: 'P/T Slow Mode',
			options: [
				{
					type: 'dropdown',
					label: 'Slow Mode On/Off',
					id: 'bol',
					choices: [{ id: '1', label: 'Off' }, { id: '0', label: 'On' }]
				}
			]
		},
		'zoomI': { label: 'Zoom In' },
		'zoomO': { label: 'Zoom Out' },
		'zoomS': { label: 'Zoom Stop' },
		'zoomSpeedS': {
			label: 'Zoom Speed',
			options: [
				{
					type: 'dropdown',
					label: 'speed setting',
					id: 'speed',
					choices: CHOICE_ZOOMSPEED
				}
			]
		},
		'zoomSpeedU': { label: 'Zoom Speed Up' },
		'zoomSpeedD': { label: 'Zoom Speed Down' },
		'zoomTime': {
			label: 'Zoom Postion In/Out (ms)',
			options: [
				{
					type: 'number',
					label: 'Zoom In (ms)',
					id: 'zIn',
					default: 2500,
					min: 0,
					max: 99999,
				},
				{
					type: 'number',
					label: 'Zoom Out (ms)',
					id: 'zOut',
					default: 1000,
					min: 0,
					max: 99999,
				}
			]
		},
		'zInMS': {
			label: 'Zoom In for ms',
			options: [
				{
					type: 'number',
					label: 'Zoom In (ms)',
					id: 'ms',
					default: 1000,
					min: 0,
					max: 99999,
				}
			]
		},
		'zOutMS': {
			label: 'Zoom Out for ms',
			options: [
				{
					type: 'number',
					label: 'Zoom Out (ms)',
					id: 'ms',
					default: 1000,
					min: 0,
					max: 99999,
				}
			]
		},
		'focusN': { label: 'Focus Near' },
		'focusF': { label: 'Focus Far' },
		'focusS': { label: 'Focus Stop' },
		'focusM': {
			label: 'Focus Mode',
			options: [
				{
					type: 'dropdown',
					label: 'Auto / Manual Focus',
					id: 'bol',
					choices: [{ id: '0', label: 'Auto Focus' }, { id: '1', label: 'Manual Focus' }]
				}
			]
		},
		'expM': {
			label: 'Exposure Mode',
			options: [
				{
					type: 'dropdown',
					label: 'Mode setting',
					id: 'val',
					choices: [
						{ id: '0', label: 'Full auto' },
						{ id: '1', label: 'Manual' },
						{ id: '2', label: 'Shutter Pri' },
						{ id: '3', label: 'Iris Pri' },
						{ id: '4', label: 'Bright mode (manual)' }
					]
				}
			]
		},
		'irisU': { label: 'Iris Up' },
		'irisD': { label: 'Iris Down' },
		'irisS': {
			label: 'Set Iris',
			options: [
				{
					type: 'dropdown',
					label: 'Iris setting',
					id: 'val',
					choices: IRIS
				}
			]
		},
		'shutU': { label: 'Shutter Up' },
		'shutD': { label: 'Shutter Down' },
		'shutS': {
			label: 'Set Shutter',
			options: [
				{
					type: 'dropdown',
					label: 'Shutter setting',
					id: 'val',
					choices: SHUTTER
				}
			]
		},
		'savePset': {
			label: 'Save Preset',
			options: [
				{
					type: 'dropdown',
					label: 'Preset Nr.',
					id: 'val',
					choices: PRESET
				}
			]
		},
		'recallPset': {
			label: 'Recall Preset',
			options: [
				{
					type: 'dropdown',
					label: 'Preset Nr.',
					id: 'val',
					choices: PRESET
				}
			]
		},
		'custom': {
			label: 'Custom command',
			options: [
				{
					type: 'textinput',
					label: 'Custom command, must start with 8',
					id: 'custom',
					regex: '/^8[0-9a-fA-F]\\s*([0-9a-fA-F]\\s*)+$/',
					width: 6
				}
			]
		},
		'tally': {
			label: 'Tally Colour',
			options: [
				{
					type: 'dropdown',
					label: 'Colour setting',
					id: 'val',
					default: 0,
					choices: [
						{ id: '0', label: 'Red' },
						{ id: '1', label: 'Green' },
						{ id: '2', label: 'Off' },
					]
				}
			]
		},
		'speedPset': {
			label: 'Preset Drive Speed',
			options: [
				{
					type: 'dropdown',
					label: 'Preset Nr.',
					id: 'val',
					choices: PRESET
				},
				{
					type: 'dropdown',
					label: 'speed setting',
					id: 'speed',
					choices: SPEED
				}
			]
		},
		'osd': {
			label: 'OSD Controls',
			options: [
				{
					type: 'dropdown',
					label: 'OSD button',
					id: 'val',
					default: 0,
					choices: [
						{ id: '0', label: 'OSD ON' },
						{ id: '1', label: 'OSD OFF' },
						{ id: '2', label: 'ENTER' },
						{ id: '3', label: 'BACK' },
						{ id: '4', label: 'UP' },
						{ id: '5', label: 'DOWN' },
						{ id: '6', label: 'LEFT' },
						{ id: '7', label: 'RIGHT' },
						{ id: '8', label: 'STOP' },
					]
				}
			]
		},

	});
}

instance.prototype.requestState = function () {
	var self = this;

	cmd = '\x09\x7E\x7E\x70\xFF';
	self.sendVISCACommand(cmd);
}

instance.prototype.prependPacketSize = function (cmd) {
	//Calculates the packet size from the provided packet and prepends the bytes
	let cmdsize;
	let pktsize = Buffer.alloc(2);

	cmdsize = Buffer.byteLength(cmd) + 2;
	pktsize.writeUInt16LE(cmdsize, 0);
	cmd = Buffer.concat([pktsize.swap16(), cmd]);

	return cmd;
}

instance.prototype.sendVISCACommand = function (str) {
	var self = this;

	if (self.tcp !== undefined) {
		var buf = Buffer.from(str, 'binary');
		//Add device ID
		buf = Buffer.concat([self.deviceAddress, buf]);

		debug(self.prependPacketSize(buf));
		self.tcp.send(self.prependPacketSize(buf));
	}
};

instance.prototype.action = function (action) {
	var self = this;
	var opt = action.options;
	var cmd = ''

	var panspeed = String.fromCharCode(parseInt(self.ptSpeed, 16) & 0xFF);
	var tiltspeed = String.fromCharCode(Math.min(parseInt(self.ptSpeed, 16), 0x14) & 0xFF);


	switch (action.action) {

		case 'left':
			cmd = '\x01\x06\x01' + panspeed + tiltspeed + '\x01\x03\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'right':
			cmd = '\x01\x06\x01' + panspeed + tiltspeed + '\x02\x03\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'up':
			cmd = '\x01\x06\x01' + panspeed + tiltspeed + '\x03\x01\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'down':
			cmd = '\x01\x06\x01' + panspeed + tiltspeed + '\x03\x02\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'upLeft':
			cmd = '\x01\x06\x01' + panspeed + tiltspeed + '\x01\x01\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'upRight':
			cmd = '\x01\x06\x01' + panspeed + tiltspeed + '\x02\x01\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'downLeft':
			cmd = '\x01\x06\x01' + panspeed + tiltspeed + '\x01\x02\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'downRight':
			cmd = '\x01\x06\x01' + panspeed + tiltspeed + '\x02\x02\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'stop':
			cmd = '\x01\x06\x01' + panspeed + tiltspeed + '\x03\x03\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'home':
			cmd = '\x01\x06\x04\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'ptSpeedS':
			self.ptSpeed = opt.speed;

			var idx = -1;
			for (var i = 0; i < SPEED.length; ++i) {
				if (SPEED[i].id == self.ptSpeed) {
					idx = i;
					break;
				}
			}
			if (idx > -1) {
				self.ptSpeedIndex = idx;
			}
			debug(self.ptSpeed + ' == ' + self.ptSpeedIndex)
			break;

		case 'ptSpeedU':
			if (self.ptSpeedIndex == 23) {
				self.ptSpeedIndex = 23;
			}
			else if (self.ptSpeedIndex < 23) {
				self.ptSpeedIndex++;
			}
			self.ptSpeed = SPEED[self.ptSpeedIndex].id
			break;

		case 'ptSpeedD':
			if (self.ptSpeedIndex == 0) {
				self.ptSpeedIndex = 0;
			}
			else if (self.ptSpeedIndex > 0) {
				self.ptSpeedIndex--;
			}
			self.ptSpeed = SPEED[self.ptSpeedIndex].id
			break;

		case 'zoomSpeedS':
			self.zoomSpeed = opt.speed;

			var idx = -1;
			for (var i = 0; i < CHOICE_ZOOMSPEED.length; ++i) {
				if (CHOICE_ZOOMSPEED[i].id == self.zoomSpeed) {
					idx = i;
					break;
				}
			}
			if (idx > -1) {
				self.zoomSpeedIndex = idx;
			}
			debug(self.zoomSpeed + ' == ' + self.zoomSpeedIndex)
			break;

		case 'zoomSpeedU':
			if (self.zoomSpeedIndex == 7) {
				self.zoomSpeedIndex = 7;
			}
			else if (self.zoomSpeedIndex < 7) {
				self.zoomSpeedIndex++;
			}
			self.zoomSpeed = CHOICE_ZOOMSPEED[self.zoomSpeedIndex].id
			break;

		case 'zoomSpeedD':
			if (self.zoomSpeedIndex == 1) {
				self.zoomSpeedIndex = 1;
			}
			else if (self.zoomSpeedIndex > 0) {
				self.zoomSpeedIndex--;
			}
			self.zoomSpeed = CHOICE_ZOOMSPEED[self.zoomSpeedIndex].id
			break;

		case 'zoomI':
			//Variable zoom speed
			var zoomspeed = String.fromCharCode(parseInt(self.zoomSpeed, 16) + 32 & 0xFF);

			cmd = '\x01\x04\x07' + zoomspeed + '\xff';
			self.sendVISCACommand(cmd);
			break;

		case 'zoomO':
			//Variable zoom speed
			var zoomspeed = String.fromCharCode(parseInt(self.zoomSpeed, 16) + 48 & 0xFF);

			cmd = '\x01\x04\x07' + zoomspeed + '\xff';
			self.sendVISCACommand(cmd);
			break;

		case 'zoomS':
			cmd = '\x01\x04\x07\x00\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'focusN':
			cmd = '\x01\x04\x08\x03\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'focusF':
			cmd = '\x01\x04\x08\x02\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'focusS':
			cmd = '\x01\x04\x08\x00\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'focusM':
			if (opt.bol == 0) {
				cmd = '\x01\x04\x38\x02\xFF';
			}
			if (opt.bol == 1) {
				cmd = '\x01\x04\x38\x03\xFF';
			}
			self.sendVISCACommand(cmd);
			break;

		case 'expM':
			if (opt.val == 0) {
				cmd = '\x01\x04\x39\x00\xFF';
			}
			if (opt.val == 1) {
				cmd = '\x01\x04\x39\x03\xFF';
			}
			if (opt.val == 2) {
				cmd = '\x01\x04\x39\x0A\xFF';
			}
			if (opt.val == 3) {
				cmd = '\x01\x04\x39\x0B\xFF';
			}
			if (opt.val == 4) {
				cmd = '\x01\x04\x39\x0D\xFF';
			}
			self.sendVISCACommand(cmd);
			break;

		case 'irisU':
			cmd = '\x01\x04\x0B\x02\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'irisD':
			cmd = '\x01\x04\x0B\x03\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'irisS':
			var cmd = Buffer.from('\x01\x04\x4B\x00\x00\x00\x00\xFF', 'binary');
			cmd.writeUInt8((parseInt(opt.val, 16) & 0xF0) >> 4, 6);
			cmd.writeUInt8(parseInt(opt.val, 16) & 0x0F, 7);
			self.sendVISCACommand(cmd);
			debug('cmd=', cmd);
			break;

		case 'shutU':
			cmd = '\x01\x04\x0A\x02\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'shutD':
			cmd = '\x01\x04\x0A\x03\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'shutS':
			var cmd = Buffer.from('\x01\x04\x4A\x00\x00\x00\x00\xFF', 'binary');
			cmd.writeUInt8((parseInt(opt.val, 16) & 0xF0) >> 4, 6);
			cmd.writeUInt8(parseInt(opt.val, 16) & 0x0F, 7);
			self.sendVISCACommand(cmd);
			debug('cmd=', cmd);
			break;

		case 'savePset':
			cmd = '\x01\x04\x3F\x01' + String.fromCharCode(parseInt(opt.val, 16) & 0xFF) + '\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'recallPset':
			cmd = '\x01\x04\x3F\x02' + String.fromCharCode(parseInt(opt.val, 16) & 0xFF) + '\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'speedPset':
			cmd = '\x01\x7E\x01\x0B' + String.fromCharCode(parseInt(opt.val, 16) & 0xFF) + String.fromCharCode(parseInt(opt.speed, 16) & 0xFF) + '\xFF';
			self.sendVISCACommand(cmd);
			break;

		case 'tally':
			if (opt.val == 0) {
				cmd = '\x01\x7E\x01\x0A\x00\x02\x03\xFF';
			}
			if (opt.val == 1) {
				cmd = '\x01\x7E\x01\x0A\x00\x03\x02\xFF';
			}
			if (opt.val == 2) {
				cmd = '\x01\x7E\x01\x0A\x00\x03\x03\xFF';
			}
			self.sendVISCACommand(cmd);
			break;

		case 'osd':
			switch (opt.val) {
				case 0:
					//OSD ON
					cmd = '\x01\x06\x06\x02\xff';
					break;
				case 1:
					//OSD OFF
					cmd = '\x01\x06\x06\x03\xff';
					break;
				case 2:
					//ENTER
					cmd = '\x01\x7e\x01\x02\x00\x01\xff';
					break;
				case 3:
					//BACK
					cmd = '\x01\x06\x01\x09\x09\x01\x03\xff';
					break;
				case 4:
					//UP
					cmd = '\x01\x06\x01\x0a\x0a\x03\x01\xff';
					break;
				case 5:
					//DOWN
					cmd = '\x01\x06\x01\x0a\x0a\x03\x02\xff';
					break;
				case 6:
					//LEFT
					cmd = '\x01\x06\x01\x0a\x0a\x01\x03\xff';
					break;
				case 7:
					//RIGHT
					cmd = '\x01\x06\x01\x0a\x0a\x02\x03\xff';
					break;
				case 8:
					//RELEASE/STOP
					cmd = '\x01\x06\x01\x01\x01\x03\x03\xff';
					break;
			}
			self.sendVISCACommand(cmd);
			break;

		case 'custom':
			var hexData = opt.custom.replace(/\s+/g, '');
			var tempBuffer = Buffer.from(hexData, 'hex');
			cmd = tempBuffer.toString('binary');

			self.sendVISCACommand(cmd);

			break;

		case 'zoomTime':
			//For heads that do not support direct Zoom control

			//Zoom in for ms
			cmd = '\x01\x04\x07\x27\xff';
			self.sendVISCACommand(cmd);

			setTimeout(function () {
				//Stop
				cmd = '\x01\x04\x07\x00\xFF';

				//Zoom out for ms
				cmd = '\x01\x04\x07\x37\xff';
				self.sendVISCACommand(cmd);
				setTimeout(function () {
					//Stop
					cmd = '\x01\x04\x07\x00\xFF';
					self.sendVISCACommand(cmd);
				}.bind(this), opt.zOut);

			}.bind(this), opt.zIn);
			break;
		case 'zInMS':
			//Zoom in for ms
			cmd = '\x01\x04\x07\x27\xff';
			self.sendVISCACommand(cmd);

			setTimeout(function () {
				//Stop
				cmd = '\x01\x04\x07\x00\xFF';
				self.sendVISCACommand(cmd);
			}.bind(this), opt.ms);
			break;
		case 'zOutMS':
			//Zoom out for ms
			cmd = '\x01\x04\x07\x37\xff';
			self.sendVISCACommand(cmd);

			setTimeout(function () {
				//Stop
				cmd = '\x01\x04\x07\x00\xFF';
				self.sendVISCACommand(cmd);
			}.bind(this), opt.ms);
			break;
	}

	self.setVariable('pt_speed', self.ptSpeedIndex);
	self.setVariable('zoom_speed', self.zoomSpeedIndex);
};

instance_skel.extendedBy(instance);

// Variables for Base64 image data do not edit
var image_up = 'iVBORw0KGgoAAAANSUhEUgAAAEgAAAA6AQMAAAApyY3OAAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDAgNzkuMTYwNDUxLCAyMDE3LzA1LzA2LTAxOjA4OjIxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+LUNEtwAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAAABlBMVEUAAAD///+l2Z/dAAAAAXRSTlMAQObYZgAAAIFJREFUKM+90EEKgzAQRmFDFy49ghcp5FquVPBighcRegHBjWDJ68D8U6F7m00+EnhkUlW3ru6rdyCV0INQzSg1zFLLKmU2aeCQQMEEJXIQORRsTLNyKJhNm3IoaPBg4mQorp2Mh1+00kKN307o/bZrpt5O/FlPU/c75X91/fPd6wPRD1eHyHEL4wAAAABJRU5ErkJggg==';

var image_down = 'iVBORw0KGgoAAAANSUhEUgAAAEgAAAA6AQMAAAApyY3OAAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDAgNzkuMTYwNDUxLCAyMDE3LzA1LzA2LTAxOjA4OjIxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+LUNEtwAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAAABlBMVEUAAAD///+l2Z/dAAAAAXRSTlMAQObYZgAAAIlJREFUKM/F0DEOwyAMBVAjDxk5Qo7CtdiClIv1KJF6gUpZIhXxY2zTDJ2benoS8LFN9MsKbYjxF2XRS1UZ4bCeGFztFmNqphURpidm146kpwFvLDYJpPQtLSLNoySyP2bRpoqih2oSFW8K3lYAxmJGXA88XMnjeuDmih7XA8vXvNeeqX6U6aY6AacbWAQNWOPUAAAAAElFTkSuQmCC';

var image_left = 'iVBORw0KGgoAAAANSUhEUgAAAEgAAAA6AQMAAAApyY3OAAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDAgNzkuMTYwNDUxLCAyMDE3LzA1LzA2LTAxOjA4OjIxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+LUNEtwAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAAABlBMVEUAAAD///+l2Z/dAAAAAXRSTlMAQObYZgAAAHpJREFUKM+1kTEOgCAQBM9Q2JjwA/mJPA2fxlN4giWF8TRBBhMpbKSaZie3i8gPb4Y8FNZKGm8YIAONkNWacIruQLejy+gyug1dQhfRqZa0v6gYA6QfqSWapZnto1B6XdUuFaVHoJunr2MD21nIdJYUEhLYfoGmP777BKKIXC0eYSD5AAAAAElFTkSuQmCC';

var image_right = 'iVBORw0KGgoAAAANSUhEUgAAAEgAAAA6AQMAAAApyY3OAAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDAgNzkuMTYwNDUxLCAyMDE3LzA1LzA2LTAxOjA4OjIxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+LUNEtwAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAAABlBMVEUAAAD///+l2Z/dAAAAAXRSTlMAQObYZgAAAHhJREFUKM+10LERgCAMQFE4CktHcBRWcRMYzVEcwdKCI+od+fGksVCq3/AuiXOfvZnaNXzRClVrEKtMLdSqP2RTRQAFMAFGwAlw7MAk0sAzGnhVoerLKg/F5Pv4NoFNZZNGpk9sxJYeLsDdL5T7S8IFOM/R3OZ+fQeQZV9pMy+bVgAAAABJRU5ErkJggg==';

var image_up_right = 'iVBORw0KGgoAAAANSUhEUgAAAEgAAAA6CAMAAAAk2e+/AAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDAgNzkuMTYwNDUxLCAyMDE3LzA1LzA2LTAxOjA4OjIxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+LUNEtwAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAABhlBMVEUAAAD///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+X02G5AAAAgXRSTlMAAte32QZhZx7d+TywDTf8/d5VstYPOxULNvKmSY8TFBrxyeGCluJeELQ5uw7ULND4BedlKuv2P/vDA8UgCk30WO41s8+5X8dABAz6QhHVaR156JpPnihSfTJDNOMBm4bzSICqr23NsRjcGRbtjTCS2lzsOmyu9+WLKb2fTL8+RPDhqO4yAAABfElEQVRYw+3WZW/CUBQG4AO0FBsOwwcMm7sLc3d3d3e388/HGGs7lpD0tsm+9P3S5CT3SdPec+8BkCNHzv9FAVAAEABYdQDkA7jo9GNUIDMBzstb5vr0/Gx8Z35zOjI36R2xbu+619eWa2xCoK0FClF5h1cWxDHEwilEOyLlQc8hokoAlMRcESBh7siQlJBWKkijNaHuPrWBED9iYiDQ7Pv1D4Z4/DXyFo2JgeAghQEkEgAvT6IgNo/PIUmgd62oj80mqEIpINoXRkmg2j2UBDIWVXKLTSXEUIOF/xbV5aRQsJvvUOoqMqjZZ+c7FcX8ThYCtTbxHV0fkEGDA73D3Dpzi/6rWEYAdSn579PZ/t3IBJChkef0dLRlHXdkJ6TSmSnmiYPq1LQIiGHX9BvZYinJ7/+R6q1czUG0j9KSOTxDc6UhshZhMIQrS78mncwZtzErrNcYL6V2Zd0tJ6i7QFtAYPcvHv25W6J+/Y3BrRA/x6WGuGN5mpUjhyyfsGtrpKE95HoAAAAASUVORK5CYII=';

var image_down_right = 'iVBORw0KGgoAAAANSUhEUgAAAEgAAAA6CAMAAAAk2e+/AAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDAgNzkuMTYwNDUxLCAyMDE3LzA1LzA2LTAxOjA4OjIxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+LUNEtwAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAABXFBMVEUAAAD///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9jYfXuAAAAc3RSTlMAQ98Ox1j9gAtRNTqBPfgu9p/MTQ+G1Qfx7Y0VBYyJgjkGd3ysU+Zz1IQvMM20PgwBp8Mi4TSUiDvlPxylsaF2WfcjJh0S+wLzQLmY4l/ovX3ra1rPLAOSKa4RUEvgcZwbFHqPzodGbX7qPMvCtsEq1laguT+HEwAAAVlJREFUWMPt1sduwkAQgOGxDfFCIITe0nvvvZHee++992TeX4pJQIC9hPWaQ6T41x6skfY7WGPJAGZm/6qgZjIH4AMgOp2Lq32batTkdW/trPt9+qC70DVmSKS2BXF7A1fX9DDnN2FUSpe8y5hID3SZuJMmrcwmoSFm5vD0BDWSNTnCUmZoD1PZtJCDGfIgRUpBMjPkR4rEAwUtFIkHAkKRuCCaxAdRJE5IK/FCGumWF1JLEW5ILfFD2ST9UBaJA6JLPBCQ57xAJcp5NQbtSgBReJSsH8QI5No8ODo+u397ecL3T35IGhcRA4jig8E9qmjAX2OGnAV5ggrxr0ELOaByVmg6B1TGvEYyTvxcKUaMv/ii7xN/VAZYY2dfSHkkPOYY7Kpf7OmLzLfGPIFGd6izWrRUjdYt9Xfo+ULsLpgRKqGtGyadAEIUmnuhXSAwMAXD5j+omZlZRl+X30CWTm2dHwAAAABJRU5ErkJggg==';

var image_up_left = 'iVBORw0KGgoAAAANSUhEUgAAAEgAAAA6CAMAAAAk2e+/AAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDAgNzkuMTYwNDUxLCAyMDE3LzA1LzA2LTAxOjA4OjIxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+LUNEtwAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAABLFBMVEUAAAD///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9PVkEkAAAAY3RSTlMAAQ/6Uc0OEAvHTzL7TcudsMHvdwnfUwMcG8UGiIfTrIkg9QI+/ZTDe460km73LNovCo1vQUuR4Lwk45/OK+3UERTkekziZlSK8QQnoOsFaaXmLqOylvPZLYDRZTUWUpiTDfAuEmiSAAABUklEQVRYw+3WZ2+DMBAG4EtTygrQ7NHsJt1777333vv+/38o6gIMSo0dqf3AK1lIZ/mRjPEJgCBBgvxtQr8WqDKbCiWUG1AnYXU7C7UJqKQSR5oKQwqIPphsYW24nEPjJCYXilf9F+G+qeTmThTP5w8X8gK9NLqOGMGPhD8fdXtBkGihlmlsmF5aqK2xg9FmQe3/DupuEhTpoT41z/V1HVHfxWRRo/6ORBfyjILx9mRo+2MDlS3ggF5q4uP9qzmVNjfOA+EDdDLcWA8IW6FJEJPkCbFI3hCDZEFVPsmC7mQuyYJ0iUuyIAG4JDvEJTkgHskJcUgExC6RECmxQ4REDa24ILsU6wL/rfYHskmX9C87Pfi9aA5cUmnRx/kffDmncSCkat7X342KSzOIuesNR1WSl7GU8Xfbbs9Gyoo0TvRp6Tie8d2TOsyx51UMEiQIS94B13oTqqYgGGoAAAAASUVORK5CYII=';

var image_down_left = 'iVBORw0KGgoAAAANSUhEUgAAAEgAAAA6CAMAAAAk2e+/AAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDAgNzkuMTYwNDUxLCAyMDE3LzA1LzA2LTAxOjA4OjIxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+LUNEtwAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAABg1BMVEUAAAD///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8aT76cAAAAgHRSTlMAafwJfflezc+3WA7Z5Rk6PAvpBNE73kJT89QxZ48czNIv9A1DnI3qKQUaymjT4a7HdVuGf85LR20CVHr+tLBlA0GvYSTYZEnbAcazNPX4yB4GrAgnmL6Bcj4qIVKIe8kdVadIEe27B90bOG/3Er1rYJq1wibyh+4Q5CMzRllMXDo5euMAAAGfSURBVFjD7dblUwJBGAbw5aSlBJRGQERBkLC7u7u7u7veP90jDnaEcdhjP+k9X5h9Zu43O7PLe4eQECH/KGsIaUooOEcLK75LpehH628idSrE+nMANfyQ3MY2BRm0C6mM462tUwJAJtVyUB1WmsoSFZEk46D6TBcYS3UKPpCYawxD5VxHImVD/RHIxMQbGintkGQcppkcOkuutQPYfkDfmjck556ZTSydve2YY5UWk0Mww672VPh+XFqCU8tA+whtL+KOpa+bF3Rh8B4ymDNaSnSzG9IPIpsL34/HTPZfS58auMPYuYNMWcQXOsD3U9ZDOkZkkCvqwSIqUI2WfEDmgiQxRANiIp8GKtDLO6/Znw19oOdXhKoROtEUBr1F5Y9f4dt1XygqKgh6YqcHwMQkQBWICr1H6czTgrpoQde0IGnekJEWNEwLMv/GPDDB/M/fDioVeLYA5GqoYt+xNRY4toJkCiBUG7vTEVxJu2Z549RbqXQuba7uVDZWO66mgw6d7kYaEPvvCb+REIp/srGzLP4aa0n8zKFkKUSIkD+Qb9QrYMvxAbaBAAAAAElFTkSuQmCC';

exports = module.exports = instance;
