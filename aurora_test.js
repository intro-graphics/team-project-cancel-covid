import {defs, tiny} from './examples/common.js';

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Matrix, Mat4, Light, Shape, Material, Scene,
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


export class Aurora_Test extends Scene {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();
        this.hover = this.swarm = false;
        // At the beginning of our program, load one of each of these shape definitions onto the GPU.
        this.shapes = {
            'cube': new Cube(),
            'outline': new Cube_Outline(),
        };

        // *** Materials
        this.materials = {
            plastic: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
        };
        // The white material and basic shader are used for drawing the outline.
        this.white = new Material(new defs.Basic_Shader());

        this.throw_queue = [];
        this.gravity = 20;
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
    add_mouse_controls(canvas, program_state, context) {
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

            this.throw_object(e, mouse_position(e), program_state, context)
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

    // returns a height given the initial height and the time elapsed (in seconds) from the initial
    // drop that simulates a bouncing motion
    get_height_at_time(init_height, init_velocity, time_elapsed) {
        // can adjust this
        let max_bounces = init_height;

        // decrease max height over time
        let max_height = Math.max(init_height - time_elapsed, 0);
        let max_velocity = Math.sqrt(2 * this.gravity * max_height);
        let period = 2 / this.gravity * max_velocity;

        // stop bouncing after max_bounces
        if ((time_elapsed + (1 / 2 * period)) / (period) > max_bounces) {
            return 0;
        }

        // otherwise, calculate the height at time t
        let t = (time_elapsed + (1 / 2 * period)) % (period);
        let h = Math.max(- 1 / 2 * this.gravity * t ** 2 + max_velocity * t, 0);
        return h;
    }

    // when mouse is clicked, throw an object
    throw_object(e, pos, context, program_state) {
        let pos_ndc_far = vec4(pos[0], pos[1], 1.0, 1.0);
        let center_ndc_near = vec4(0.0, 0.0, 0.0, 1.0);

        let P = program_state.program_state.projection_transform;
        let V = program_state.program_state.camera_transform;

        let pos_world_far = Mat4.inverse(P.times(V)).times(pos_ndc_far);
        let center_world_near = Mat4.inverse(P.times(V)).times(center_ndc_near);

        pos_world_far.scale_by(1 / pos_world_far[3]);
        center_world_near.scale_by(1 / center_world_near[3]);
        let direction_world = pos_world_far.minus(center_world_near);

        console.log(pos_world_far);
        console.log(center_world_near);
        console.log(direction_world);

        let animation_object = {
            start_time: program_state.program_state.animation_time,
            end_time: program_state.program_state.animation_time + 10000,
            direction: direction_world,
        }

        this.throw_queue.push(animation_object);
    }


    display(context, program_state) {
        // Setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            // Define the global camera and projection matrices, which are stored in program_state.
            program_state.set_camera(Mat4.translation(0, -5, 0));

            let canvas = context.canvas;
            const mouse_position = (e, rect = canvas.getBoundingClientRect()) =>
                vec((e.clientX - (rect.left + rect.right) / 2) / ((rect.left + rect.right) / 2),
                    (e.clientY - (rect.bottom + rect.top) / 2) / ((rect.bottom + rect.top) / 2));
            canvas.addEventListener("mousedown", e => {
                e.preventDefault();
                this.throw_object(e, mouse_position(e), program_state, context)
                // console.log(mouse_position(e));
                let camera_pos = program_state.camera_transform.times(vec4(0.0, 0.0, 0.0, 1.0));
                console.log(camera_pos[1]);
            });
        }
        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, 1, 100);

        // *** Lights: *** Values of vector or point lights.
        const light_position = vec4(0, 10, 10, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 1000)];



        const blue = hex_color("#1a9ffa");

        let room_transform = Mat4.identity();
        room_transform = room_transform.times(Mat4.translation(0,20,-20))
            .times(Mat4.scale(50, 20, 40));
        this.shapes.outline.draw(context, program_state, room_transform, this.white, "LINES");


        const t = program_state.animation_time;
        if (this.throw_queue.length > 0) {
            for (let i = 0; i < this.throw_queue.length; i++) {
                let obj = this.throw_queue[i];

                let start_time = obj.start_time;
                let end_time = obj.end_time;
                let direction = obj.direction;
                if (t > end_time) {

                }
                if (t <= end_time && t >= start_time) {
                    let camera_pos = program_state.camera_transform.times(vec4(0.0, 0.0, 0.0, 1.0));
                    // console.log(camera_pos);

                    let time_elapsed = t - start_time;
                    // console.log(time_elapsed);
                    let x_pos = camera_pos[0] + (direction[0] * time_elapsed / 1000);
                    let y_pos = this.get_height_at_time(camera_pos[1],
                        1,
                        time_elapsed / 1000) + 2;
                    let z_pos = camera_pos[2] + (direction[2] * time_elapsed / 1000);
                    // insert collision detection here

                    // console.log(x_pos);
                    // console.log(y_pos);
                    // console.log(z_pos);
                    let model_trans = Mat4.translation(x_pos, y_pos, z_pos);


                    this.shapes.cube.draw(context,
                        program_state,
                        model_trans,
                        this.materials.plastic.override({color:blue}));
                }
            }
        }

        // TODO:  Draw your entire scene here.  Use this.draw_box( graphics_state, model_transform ) to call your helper.
    }
}