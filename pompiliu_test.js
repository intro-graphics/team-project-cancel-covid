import {defs, tiny} from './examples/common.js';

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Matrix, Mat4, Light, Shape, Material, Scene, Shader, Texture, Component 
} = tiny;

class Cube extends Shape {
    constructor() {
        super("position", "normal",);
        // Loop 3 times (for each axis), and inside loop twice (for opposing cube sides):
        this.arrays.position = Vector3.cast(
            [-1, -1, -1], [1, -1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, 1, 1], [-1, 1, 1],
            [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1], [1, -1, 1], [1, -1, -1], [1, 1, 1], [1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, -1], [-1, -1, -1], [1, 1, -1], [-1, 1, -1]);
        this.arrays.normal = Vector3.cast(
            [0, -1, 0], [0, -1, 0], [0, -1, 0], [0, -1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0],
            [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0],
            [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1]);
        // Arrange the vertices into a square shape in texture space too:
        this.indices.push(0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6, 8, 9, 10, 9, 11, 10, 12, 13,
            14, 13, 15, 14, 16, 17, 18, 17, 19, 18, 20, 21, 22, 21, 23, 22);
    }
}

class Cube_Outline extends Shape {
    constructor() {
        super("position", "color");
        //  TODO (Requirement 5).
        // When a set of lines is used in graphics, you should think of the list entries as
        // broken down into pairs; each pair of vertices will be drawn as a line segment.
        // Note: since the outline is rendered with Basic_shader, you need to redefine the position and color of each vertex

        this.arrays.position = Vector3.cast(
            [-1, -1, -1], [1, -1, -1],
            [-1, -1, 1], [1, -1, 1],
            [1, 1, -1], [-1, 1, -1],
            [1, 1, 1], [-1, 1, 1],
            [-1, -1, -1], [-1, -1, 1],
            [-1, 1, -1], [-1, 1, 1],
            [1, -1, 1], [1, -1, -1],
            [1, 1, 1], [1, 1, -1],
            [-1, -1, -1], [-1, 1, -1],
            [1, -1, -1], [1, 1, -1],
            [-1, -1, 1], [-1, 1, 1],
            [1, -1, 1], [1, 1, 1]);

        this.arrays.color = [
            color(1,1,1,1), color(1,1,1,1),
            color(1,1,1,1), color(1,1,1,1),
            color(1,1,1,1), color(1,1,1,1),
            color(1,1,1,1), color(1,1,1,1),
            color(1,1,1,1), color(1,1,1,1),
            color(1,1,1,1), color(1,1,1,1),
            color(1,1,1,1), color(1,1,1,1),
            color(1,1,1,1), color(1,1,1,1),
            color(1,1,1,1), color(1,1,1,1),
            color(1,1,1,1), color(1,1,1,1),
            color(1,1,1,1), color(1,1,1,1),
            color(1,1,1,1), color(1,1,1,1)
        ];

        this.indices = false;
    }
}

class Cube_Single_Strip extends Shape {
    constructor() {
        super("position", "normal");
        // TODO (Requirement 6)
    }
}

export
const Shape_From_File = defs.Shape_From_File =
class Shape_From_File extends Shape
{                                   // **Shape_From_File** is a versatile standalone Shape that imports
                                    // all its arrays' data from an .obj 3D model file.
  constructor( filename )
    { super( "position", "normal", "texture_coord" );
                                    // Begin downloading the mesh. Once that completes, return
                                    // control to our parse_into_mesh function.
      this.load_file( filename );
    }
  load_file( filename )
      {                             // Request the external file and wait for it to load.
        return fetch( filename )
          .then( response =>
            { if ( response.ok )  return Promise.resolve( response.text() )
              else                return Promise.reject ( response.status )
            })
          .then( obj_file_contents => this.parse_into_mesh( obj_file_contents ) )
          .catch( error => { throw "OBJ file loader:  OBJ file either not found or is of unsupported format." } )
      }
  parse_into_mesh( data )
    {                           // Adapted from the "webgl-obj-loader.js" library found online:
      var verts = [], vertNormals = [], textures = [], unpacked = {};

      unpacked.verts = [];        unpacked.norms = [];    unpacked.textures = [];
      unpacked.hashindices = {};  unpacked.indices = [];  unpacked.index = 0;

      var lines = data.split('\n');

      var VERTEX_RE = /^v\s/;    var NORMAL_RE = /^vn\s/;    var TEXTURE_RE = /^vt\s/;
      var FACE_RE = /^f\s/;      var WHITESPACE_RE = /\s+/;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        var elements = line.split(WHITESPACE_RE);
        elements.shift();

        if      (VERTEX_RE.test(line))   verts.push.apply(verts, elements);
        else if (NORMAL_RE.test(line))   vertNormals.push.apply(vertNormals, elements);
        else if (TEXTURE_RE.test(line))  textures.push.apply(textures, elements);
        else if (FACE_RE.test(line)) {
          var quad = false;
          for (var j = 0, eleLen = elements.length; j < eleLen; j++)
          {
              if(j === 3 && !quad) {  j = 2;  quad = true;  }
              if(elements[j] in unpacked.hashindices)
                  unpacked.indices.push(unpacked.hashindices[elements[j]]);
              else
              {
                  var vertex = elements[ j ].split( '/' );

                  unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 0]);
                  unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 1]);
                  unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 2]);

                  if (textures.length)
                    {   unpacked.textures.push(+textures[( (vertex[1] - 1)||vertex[0]) * 2 + 0]);
                        unpacked.textures.push(+textures[( (vertex[1] - 1)||vertex[0]) * 2 + 1]);  }

                  unpacked.norms.push(+vertNormals[( (vertex[2] - 1)||vertex[0]) * 3 + 0]);
                  unpacked.norms.push(+vertNormals[( (vertex[2] - 1)||vertex[0]) * 3 + 1]);
                  unpacked.norms.push(+vertNormals[( (vertex[2] - 1)||vertex[0]) * 3 + 2]);

                  unpacked.hashindices[elements[j]] = unpacked.index;
                  unpacked.indices.push(unpacked.index);
                  unpacked.index += 1;
              }
              if(j === 3 && quad)   unpacked.indices.push( unpacked.hashindices[elements[0]]);
          }
        }
      }
      {
      const { verts, norms, textures } = unpacked;
        for( var j = 0; j < verts.length/3; j++ )
        {
          this.arrays.position     .push( vec3( verts[ 3*j ], verts[ 3*j + 1 ], verts[ 3*j + 2 ] ) );
          this.arrays.normal       .push( vec3( norms[ 3*j ], norms[ 3*j + 1 ], norms[ 3*j + 2 ] ) );
          this.arrays.texture_coord.push( vec( textures[ 2*j ], textures[ 2*j + 1 ] ) );
        }
        this.indices = unpacked.indices;
      }
      this.normalize_positions( false );
      this.ready = true;
    }
  draw( caller, uniforms, model_transform, material )
    {               // draw(): Same as always for shapes, but cancel all
                    // attempts to draw the shape before it loads:
      if( this.ready )
        super.draw( caller, uniforms, model_transform, material );
    }
}

export class Pompiliu_Test extends Scene {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();
        this.hover = this.swarm = false;
        // At the beginning of our program, load one of each of these shape definitions onto the GPU.
        this.shapes = {
            'cube': new Cube(),
            'outline': new Cube_Outline(),
            "teapot": new Shape_From_File("assets/teapot.obj"),
            "amogus": new Shape_From_File( "assets/amogus.obj"),
            "amogus1": new Shape_From_File( "assets/amogusPiece1.obj"),
            "amogus2": new Shape_From_File( "assets/amogusPiece2.obj"),
            "cube01": new Shape_From_File( "assets/cube01.obj"),


        };

        // *** Materials
        this.materials = {
            plastic: new Material(new defs.Phong_Shader(), {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
           // a: { shader, ambient: .5, texture: new Texture( "assets/rgb.jpg" ) },
           // b: { shader, ambient: .5, texture:  new Texture( "assets/earth.gif" ) },
           // c: { shader, ambient:  1, texture: this.texture }
        };
        // The white material and basic shader are used for drawing the outline.
        this.white = new Material(new defs.Basic_Shader());
    }

    set_colors() {
        // TODO:  Create a class member variable to store your cube's colors.
        // Hint:  You might need to create a member variable at somewhere to store the colors, using `this`.
        // Hint2: You can consider add a constructor for class Assignment2, or add member variables in Base_Scene's constructor.
    }

    make_control_panel() {
        // Draw the scene's buttons, setup their actions and keyboard shortcuts, and monitor live measurements.
        this.key_triggered_button("Reset", ["r"], this.set_colors);
    }


    // from discussion 1b slides
    // adds event listeners for mouse
    add_mouse_controls(canvas) {
        this.mouse = {"from_center" : vec(0, 0)};
        const mouse_position = (e, rect = canvas.getBoundingClientRect()) =>
            vec((e.clientX - (rect.left + rect.right) / 2) / ((rect.left + rect.right) / 2),
                (e.clientY - (rect.bottom + rect.top) / 2) / ((rect.bottom + rect.top) / 2));

        document.addEventListener("mouseup", e => {
            this.mouse.anchor = undefined;
        });
        canvas.addEventListener("mousedown", e => {
            e.preventDefault();
            this.mouse.anchor = mouse_position(e);
            console.log(mouse_position(e));
        });
        canvas.addEventListener("mousemove", e => {
            e.preventDefault();
            this.mouse.anchor = mouse_position(e);
        });
        canvas.addEventListener("mouseup", e => {
            if (!this.mouse.anchor)
                this.mouse.from_center.scale_by(0);
        });
    }

    // returns a height given the initial height and the time elapsed from the initial drop
    // that simulates a bouncing motion
    get_height_at_time(init_height, time_elapsed) {
        // can adjust this
        let max_bounces = init_height;

        // use -20 for gravity, decrease max height over time
        const acc = 32;
        let max_height = Math.max(init_height - time_elapsed, 0);
        let init_velocity = Math.sqrt(2 * acc * max_height);
        let period = 2 / acc * init_velocity;

        // stop bouncing after max_bounces
        if ((time_elapsed + (1 / 2 * period)) / (period) > max_bounces) {
            return 0;
        }

        // otherwise, calculate the height at time t
        let t = (time_elapsed + (1 / 2 * period)) % (period);
        let h = Math.max(- 1 / 2 * acc * t ** 2 + init_velocity * t, 0);
        return h;
    }

    display(context, program_state) {
        // Setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            // Define the global camera and projection matrices, which are stored in program_state.
            program_state.set_camera(Mat4.translation(0, -5, -30));
            let canvas = context.canvas;
            this.add_mouse_controls(canvas);
        }
        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, 1, 100);

        // *** Lights: *** Values of vector or point lights.
        const light_position = vec4(0, 10, 10, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 1000)];



        const blue = hex_color("#fa751a");

        let model_transform = Mat4.identity();
        let initial_height = 10;
        const t = program_state.animation_time / 1000;
        let height = this.get_height_at_time(initial_height, t);

        // base rests at 0
        model_transform = model_transform.times(Mat4.translation(0,height + 2,0))
            .times(Mat4.scale(2,2,2));
        this.shapes.cube.draw(context, program_state, model_transform, this.materials.plastic);
        //this.shapes.cube.draw(context, program_state, model_transform, this.materials.plastic.override({color:blue}));
        //this.shapes.amogus2.draw(context, program_state, model_transform, this.materials.plastic.override({color:blue}));


        let room_transform = Mat4.identity();
        room_transform = room_transform.times(Mat4.translation(0,20,0))
            .times(Mat4.scale(50, 20, 40));
        this.shapes.outline.draw(context, program_state, room_transform, this.white, "LINES");



        // TODO:  Draw your entire scene here.  Use this.draw_box( graphics_state, model_transform ) to call your helper.
    }
}