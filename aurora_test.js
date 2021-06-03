import {defs, tiny} from './examples/common.js';

const {Vector, Vector3, vec, vec3, vec4, color, hex_color, Matrix, Mat4,
    Light, Shape, Material, Shader, Texture, Scene} = tiny;

export class Body {
    // **Body** can store and update the properties of a 3D body that incrementally
    // moves from its previous place due to velocities.  It conforms to the
    // approach outlined in the "Fix Your Timestep!" blog post by Glenn Fiedler.
    constructor(shape, material, size) {
        Object.assign(this,
            {shape, material, size})
    }

    // (within some margin of distance).
    static intersect_cube(p, margin = 0) {
        return p.every(value => value >= -1 - margin && value <= 1 + margin)
    }

    static intersect_sphere(p, margin = 0) {
        return p.dot(p) < 1 + margin;
    }

    emplace(location_matrix, linear_velocity, angular_velocity, spin_axis = vec3(0, 0, 0).randomized(1).normalized()) {                               // emplace(): assign the body's initial values, or overwrite them.
        this.center = location_matrix.times(vec4(0.0, 0.0, 0.0, 1.0));
        this.center = this.center.to3();
        // console.log(this.center);
        this.rotation = Mat4.translation(...this.center.times(-1)).times(location_matrix);
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy()};
        // drawn_location gets replaced with an interpolated quantity:
        this.drawn_location = location_matrix;
        this.temp_matrix = Mat4.identity();
        return Object.assign(this, {linear_velocity, angular_velocity, spin_axis})
    }

    advance(time_amount) {
        // advance(): Perform an integration (the simplistic Forward Euler method) to
        // advance all the linear and angular velocities one time-step forward.
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy()};
        // Apply the velocities scaled proportionally to real time (time_amount):
        // Linear velocity first, then angular:
        this.center = this.center.plus(this.linear_velocity.times(time_amount));
        this.rotation.pre_multiply(Mat4.rotation(time_amount * this.angular_velocity, ...this.spin_axis));
    }

    // The following are our various functions for testing a single point,
    // p, against some analytically-known geometric volume formula

    blend_rotation(alpha) {
        // blend_rotation(): Just naively do a linear blend of the rotations, which looks
        // ok sometimes but otherwise produces shear matrices, a wrong result.

        // TODO:  Replace this function with proper quaternion blending, and perhaps
        // store this.rotation in quaternion form instead for compactness.
        return this.rotation.map((x, i) => vec4(...this.previous.rotation[i]).mix(x, alpha));
    }

    blend_state(alpha) {
        // blend_state(): Compute the final matrix we'll draw using the previous two physical
        // locations the object occupied.  We'll interpolate between these two states as
        // described at the end of the "Fix Your Timestep!" blog post.
        this.drawn_location = Mat4.translation(...this.previous.center.mix(this.center, alpha))
            .times(this.blend_rotation(alpha))
            .times(Mat4.scale(...this.size));
    }

    check_if_colliding(b, collider) {
        // check_if_colliding(): Collision detection function.
        // DISCLAIMER:  The collision method shown below is not used by anyone; it's just very quick
        // to code.  Making every collision body an ellipsoid is kind of a hack, and looping
        // through a list of discrete sphere points to see if the ellipsoids intersect is *really* a
        // hack (there are perfectly good analytic expressions that can test if two ellipsoids
        // intersect without discretizing them into points).
        if (this == b)
            return false;
        // Nothing collides with itself.
        // Convert sphere b to the frame where a is a unit sphere:
        const T = this.inverse.times(b.drawn_location, this.temp_matrix);

        const {intersect_test, points, leeway} = collider;
        // For each vertex in that b, shift to the coordinate frame of
        // a_inv*b.  Check if in that coordinate frame it penetrates
        // the unit sphere at the origin.  Leave some leeway.
        return points.arrays.position.some(p =>
            intersect_test(T.times(p.to4(1)).to3(), leeway));
    }
}


export class Aurora_Test extends Scene {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();

        // Shapes
        this.shapes = {
            donut: new defs.Torus(15, 15, [[0, 2], [0, 1]]),
            cone: new defs.Closed_Cone(4, 10, [[0, 2], [0, 1]]),
            capped: new defs.Capped_Cylinder(4, 12, [[0, 2], [0, 1]]),
            ball: new defs.Subdivision_Sphere(3, [[0, 1], [0, 1]]),
            cube: new defs.Cube(),
            prism: new (defs.Capped_Cylinder.prototype.make_flat_shaded_version())(10, 10, [[0, 2], [0, 1]]),
            gem: new (defs.Subdivision_Sphere.prototype.make_flat_shaded_version())(2),
            donut2: new (defs.Torus.prototype.make_flat_shaded_version())(20, 20, [[0, 2], [0, 1]]),
            room: new (defs.Cube.prototype.make_flat_shaded_version()),
            wall: new (defs.Square.prototype.make_flat_shaded_version()),
            square: new defs.Square(),
        };

        // Textures
        this.textures = {
            rgb: new Texture("assets/rgb.jpg"),
            earth: new Texture("assets/earth.gif"),
            stars: new Texture("assets/stars.png"),
            text: new Texture("assets/text.png"),
        }

        // Materials
        this.materials = {
            plastic: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#1a9ffa")}),
            wallpaper: new Material(new defs.Phong_Shader(),
                {ambient: 0.2, diffusivity: 1, color: hex_color("#c4aa7e")}),
            stars: new Material(new defs.Phong_Shader(), {
                ambient: .4, color: color(.4, .8, .4, 1),
                texture: this.textures.stars
            }),
            inactive_color: new Material(new defs.Fake_Bump_Map(1), {
                color: color(.5, .5, .5, 1), ambient: .2,
                texture: this.textures.rgb
            }),
            active_color: new Material(new defs.Fake_Bump_Map(1), {
                color: color(.5, 0, 0, 1), ambient: .5,
                texture: this.textures.rgb
            }),
            bright: new Material(new defs.Phong_Shader(), {
                color: color(0, 1, 0, .5), ambient: 1
            }),
        };

        // Make simpler dummy shapes for representing all other shapes during collisions:
        this.colliders = [
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(1), leeway: .5},
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(2), leeway: .3},
            {intersect_test: Body.intersect_cube, points: new defs.Cube(), leeway: .1}
        ];

        this.collider_selection = 0;

        this.bodies = [];
        this.throw_queue = [];
        this.gravity = 20;
    }

    make_control_panel() {
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
        let W = program_state.program_state.camera_inverse;

        let pos_world_far = Mat4.inverse(P.times(V)).times(pos_ndc_far);
        let center_world_near = Mat4.inverse(P.times(V)).times(center_ndc_near);
        let camera_pos = Mat4.inverse(P.times(W)).times(center_ndc_near);
        let dir = W.times(pos_ndc_far).minus(W.times(center_ndc_near));
        console.log(dir);

        pos_world_far.scale_by(1 / pos_world_far[3]);
        center_world_near.scale_by(1 / center_world_near[3]);
        camera_pos.scale_by(1 / camera_pos[3]);
        let direction_world = pos_world_far.minus(center_world_near);
        direction_world.scale_by(1/2);

        console.log(center_world_near);
        console.log(direction_world);

        // convert to a translation matrix
        let a = Mat4.inverse(P.times(W));
        a[0] = vec4(1, 0, 0, a[0][3]);
        a[1] = vec4(0, 1, 0, a[1][3]);
        a[2] = vec4(0, 0, 1, a[2][3]);
        a[3] = vec4(0, 0, 0, a[3][3]);
        console.log(a);
        let b = new Body(this.shapes.cube, this.materials.plastic, vec3(1, 1, 1))
            .emplace(a, dir, 0);
        let object = {
            body: b,
            end_time: program_state.program_state.animation_time + 10000,
        }
        this.bodies.push(object);
        console.log(object);
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
                this.throw_object(e, mouse_position(e), program_state, context);
            });
        }
        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, 1, 100);

        // *** Lights: *** Values of vector or point lights.
        const light_position = vec4(0, 20, 8, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 100)];

        const t = program_state.animation_time;
        const dt = program_state.animation_delta_time;

        const {points, leeway} = this.colliders[this.collider_selection];
        const size = vec3(1 + leeway, 1 + leeway, 1 + leeway);

        let test_transform = Mat4.identity();
        test_transform = Mat4.rotation(Math.PI / 2, 1, 0, 0)
            .times(Mat4.scale(50, 50, 1))
            .times(Mat4.translation(0, 0, -1))
            .times(test_transform);
        let ground = new Body(this.shapes.square, this.materials.plastic, vec3(1, 1 + Math.random(), 1))
            .emplace(test_transform, vec3(0, 0, 0), 0);
        points.draw(context, program_state, ground.drawn_location, ground.material);

        // this.shapes.square.draw(context, program_state, test_transform, this.materials.stars);


        if (this.throw_queue.length > 0) {
            for (let i = 0; i < this.throw_queue.length; i++) {
                let obj = this.throw_queue[i];

                let center = obj.center;
                let start_time = obj.start_time;
                let end_time = obj.end_time;
                let direction = obj.direction;
                if (t > end_time) {

                }
                if (t <= end_time && t >= start_time) {
                    let P = program_state.projection_transform;
                    let V = program_state.camera_inverse;
                    let camera_pos = Mat4.inverse(P.times(V)).times(vec4(0.0, 0.0, 0.0, 1.0));
                    camera_pos.scale_by(1 / camera_pos[3]);
                    // console.log(camera_pos);

                    let time_elapsed = t - start_time;
                    // console.log(time_elapsed);
                    let x_pos = center[0] + (direction[0] * time_elapsed / 1000);
                    let y_pos = this.get_height_at_time(center[1],
                        1,
                        time_elapsed / 1000) + 2;
                    let z_pos = center[2] + (direction[2] * time_elapsed / 1000);
                    // insert collision detection here

                    // console.log(x_pos);
                    // console.log(y_pos);
                    // console.log(z_pos);
                    let model_trans = Mat4.translation(x_pos, y_pos, z_pos);


                    // this.shapes.cube.draw(context,
                    //     program_state,
                    //     model_trans,
                    //     this.materials.plastic);
                }
            }
        }

        if (this.bodies.length > 0) {
            for (let i = 0; i < this.bodies.length; i++) {
                let obj = this.bodies[i];

                let end_time = obj.end_time;

                if (t <= end_time) {
                    // console.log("drew box")
                    obj.body.shape.draw(context, program_state, obj.body.drawn_location, obj.body.material);
                }

            }

        }

        // TODO:  Draw your entire scene here.  Use this.draw_box( graphics_state, model_transform ) to call your helper.
    }
}