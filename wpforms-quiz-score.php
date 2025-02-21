<?php
/**
 * Plugin Name: WPForms Options Quiz Score
 * Description: Adiciona um sistema avançado de pontuação e avaliação automática para formulários WPForms, permitindo criar questionários interativos com feedback instantâneo
 * Version: 1.0.0
 * Author: <a href="https://www.linkedin.com/in/manoel-sz/">Manoel de Souza</a>
 * Author URI: <a href="https://optionstech.com.br">Optionstech</a>
 */

if (!defined('ABSPATH')) exit;

class WPForms_Quiz_Score {
    private $table_name;
    
    public function __construct() {
        global $wpdb;
        $this->table_name = $wpdb->prefix . 'wpforms_quiz_answers';
        error_log('🎯 primeiro construtor');

        
        error_log("📝 Quiz Score: Tabela configurada como: " . $this->table_name);
        
        // Move o registro do hook para fora do construtor
        register_activation_hook(__FILE__, array($this, 'create_answers_table'));
        
        // Hooks existentes
        add_action('wpforms_loaded', array($this, 'init'));
        
        // ADICIONAR ESTE HOOK para scripts
        add_action('admin_enqueue_scripts', array($this, 'enqueue_scripts')); // Para admin
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts')); // Para front-end
        
        // Hooks existentes
        add_filter('wpforms_builder_settings_sections', array($this, 'add_settings_section'), 20, 2);
        add_filter('wpforms_form_settings_panel_content', array($this, 'add_settings_content'), 20);
        add_action('wp_ajax_save_quiz_settings', array($this, 'save_quiz_settings'));
        add_action('wp_ajax_get_quiz_answers', array($this, 'get_quiz_answers'));
        add_action('wp_ajax_nopriv_get_quiz_answers', array($this, 'get_quiz_answers'));
        
        // Hooks para adicionar a opção de cálculo
        add_filter('wpforms_field_options_advanced_number', array($this, 'add_calculate_field_settings'), 10, 1);
        add_filter('wpforms_field_properties', array($this, 'add_calculate_field_option'), 10, 2);
        
        // Adiciona seção de pontuação e shortcode
        add_filter('wpforms_form_settings_panel_content', array($this, 'add_score_settings'), 10);
        add_shortcode('wpforms_quiz_score', array($this, 'score_shortcode'));
        
        // Adiciona action para salvar campo de pontuação e respostas
        add_action('wp_ajax_save_quiz_score_field', array($this, 'save_quiz_score_field'));
        add_action('wp_ajax_nopriv_save_quiz_score_field', array($this, 'save_quiz_score_field'));
        
        // Adiciona tipos de campos
        add_filter('wpforms_field_types', array($this, 'add_field_types'));
        
        // Adiciona tipos de respostas
        add_filter('wpforms_answer_types', array($this, 'add_answer_types')); 
    }

    public function init() {
        error_log('🎯 segundo init');
        // Inicializa o plugin quando WPForms estiver carregado
    }

    public function enqueue_scripts() {
        error_log('🎯 terceiro enqueue_scripts');
        // Enfileira o jQuery primeiro
        wp_enqueue_script('jquery');
        
        // Enfileira nosso script
        wp_enqueue_script(
            'wpforms-quiz-score',
            plugins_url('js/quiz-score.js', __FILE__),
            array('jquery'),
            '1.0.' . time(), // Força recarregamento do cache
            true
        );

        // Tenta obter o form_id de várias maneiras
        $form_id = 0;
        
        // Se estiver na página de edição do formulário
        if (isset($_GET['form_id'])) {
            $form_id = absint($_GET['form_id']);
        }
        // Busca o ID do formulário no HTML
        else {
            // Busca o formulário no DOM usando jQuery
            $html = file_get_contents('php://input');
            if (preg_match('/wpforms-form-(\d+)/', $html, $matches)) {
                $form_id = absint($matches[1]);
                error_log('🔍 Form ID encontrado no HTML: ' . $form_id);
            }
            
            // Se não encontrou no DOM, tenta outras formas
            if (!$form_id) {
                error_log('🔍 Nenhum Form ID encontrado no HTML');
                $forms = get_posts(array(
                    'post_type' => 'wpforms',
                    'posts_per_page' => -1
                ));

                foreach ($forms as $form) {
                    if (strpos($html, 'wpforms-form-' . $form->ID) !== false) {
                        $form_id = $form->ID;
                        break;
                    }
                }
            }
        }

        error_log('🔍 Form ID detectado: ' . $form_id);

        wp_localize_script(
            'wpforms-quiz-score',
            'wpformsQuizData',
            array(
                'ajaxurl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('wpforms-quiz'),
                'formId' => $form_id,
                'debug' => true
            )
        );

        // Enfileira CSS
        wp_enqueue_style(
            'wpforms-quiz-score',
            plugins_url('css/quiz-score.css', __FILE__),
            array(),
            '1.0.' . time()
        );
    }

    public function add_settings_section($sections, $form_data) {
        error_log('🎯 quarto add_settings_section');
        $sections['quiz_score'] = 'Opções de Pontuação';
        return $sections;
    }

    public function add_settings_content($instance) {
        global $wpdb;
        
        // Obtém o ID do formulário atual
        $current_form_id = isset($_GET['form_id']) ? absint($_GET['form_id']) : 0;
        
        if (!$current_form_id) {
            echo '<p>ID do formulário não encontrado.</p>';
            return;
        }

        // Busca todas as respostas salvas para este formulário
        $saved_answers = $wpdb->get_results($wpdb->prepare(
            "SELECT field_id, correct_answer 
             FROM {$wpdb->prefix}wpforms_quiz_answers 
             WHERE form_id = %d",
            $current_form_id
        ), OBJECT_K); // OBJECT_K usa field_id como chave

        $form = wpforms()->form->get($current_form_id);
        if (empty($form)) {
            echo '<p>Formulário não encontrado.</p>';
            return;
        }

        $form_data = json_decode($form->post_content, true);

        echo '<div class="wpforms-panel-content-section wpforms-panel-content-section-quiz_score">';
        echo '<div class="wpforms-panel-content-section-title">';
        echo 'Configurações de Pontuação';
        echo '</div>';

        if (!empty($form_data['fields'])) {
            $has_quiz_fields = false;
            
            echo '<div class="quiz-form-section">';
            
            // Filtra apenas campos do tipo radio e select
            foreach ($form_data['fields'] as $field) {
                if (in_array($field['type'], ['radio', 'select'])) {
                    $has_quiz_fields = true;
                    $field_id = $field['id'];
                    
                    // Obtém a resposta salva para este campo
                    $saved_answer = isset($saved_answers[$field_id]) ? 
                                  $saved_answers[$field_id]->correct_answer : '';
                    
                    echo '<div class="quiz-question-settings">';
                    echo '<div class="quiz-question-info">';
                    echo '<p><strong>Pergunta:</strong> ' . esc_html($field['label']) . '</p>';
                    echo '<span>Tipo: ' . ucfirst($field['type']) . ' | ID: ' . $field['id'] . '</span>';
                    echo '</div>';
                    
                    echo '<label>Selecione a resposta correta:</label>';
                    echo '<select name="quiz_correct_answer_' . $field_id . '" 
                             data-form-id="' . $current_form_id . '" 
                             data-field-id="' . $field_id . '" 
                             class="quiz-answer-select">';
                    echo '<option value="">Selecione uma resposta</option>';
                    
                    if (!empty($field['choices'])) {
                        foreach ($field['choices'] as $choice) {
                            // Compara com a resposta salva
                            $selected = ($saved_answer === $choice['label']) ? 'selected="selected"' : '';
                            echo '<option value="' . esc_attr($choice['label']) . '" ' . $selected . '>';
                            echo esc_html($choice['label']);
                            echo '</option>';
                        }
                    }
                    
                    echo '</select>';
                    
                    // Adiciona indicador visual se há resposta salva
                    if ($saved_answer) {
                        echo '<div class="answer-saved-indicator" style="color: #2271b1; margin-top: 5px;">';
                        echo '<span class="dashicons dashicons-saved"></span> Resposta salva';
                        echo '</div>';
                    }
                    
                    echo '</div>';
                    echo '<hr>';
                }
            }
            
            if (!$has_quiz_fields) {
                echo '<p>Este formulário não possui campos de múltipla escolha ou seleção.</p>';
            } else {
                echo '<div class="wpforms-setting-row quiz-save-button">';
                echo '<button class="wpforms-btn wpforms-btn-primary" id="save-quiz-settings">';
                echo '<span class="dashicons dashicons-saved"></span> Salvar Configurações</button>';
                echo '<span class="spinner"></span>';
                echo '</div>';
            }
            
            echo '</div>';
        }
        
        echo '</div>';
    }

    private function get_saved_answer($form_id, $field_id) {
        global $wpdb;
        
        $result = $wpdb->get_var($wpdb->prepare(
            "SELECT answer FROM {$wpdb->prefix}wpforms_quiz_answers 
             WHERE form_id = %d AND field_id = %d",
            $form_id,
            $field_id
        ));
        
        return $result;
    }

    public function create_answers_table() {
        global $wpdb;
        error_log('🎯 sexto create_answers_table');
        
        try {
            error_log('📝 Quiz Score: Iniciando criação da tabela');
            
            $charset_collate = $wpdb->get_charset_collate();
            $table_name = $wpdb->prefix . 'wpforms_quiz_answers';
            
            // SQL para criar a tabela com a nova coluna answer_type e field_type
            $sql = "CREATE TABLE IF NOT EXISTS $table_name (
                id bigint(20) NOT NULL AUTO_INCREMENT,
                form_id bigint(20) NOT NULL,
                field_id bigint(20) NOT NULL,
                correct_answer text NOT NULL,
                answer_type varchar(50) DEFAULT NULL,
                field_type varchar(50) DEFAULT NULL,
                created_at datetime DEFAULT CURRENT_TIMESTAMP,
                updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY  (id),
                UNIQUE KEY form_field (form_id,field_id)
            ) $charset_collate;";
            
            require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
            
            // Tenta criar a tabela
            $result = dbDelta($sql);
            error_log('Resultado do dbDelta: ' . print_r($result, true));
            
            // Verifica se a tabela foi criada
            $table_exists = $wpdb->get_var("SHOW TABLES LIKE '$table_name'") === $table_name;
            
            if ($table_exists) {
                // Verifica se a coluna answer_type existe
                $column_exists = $wpdb->get_results("SHOW COLUMNS FROM $table_name LIKE 'answer_type'");
                if (empty($column_exists)) {
                    // Adiciona a coluna se não existir
                    $wpdb->query("ALTER TABLE $table_name ADD COLUMN answer_type varchar(50) DEFAULT NULL AFTER correct_answer");
                    error_log("✅ Quiz Score: Coluna answer_type adicionada à tabela $table_name");
                }
                error_log("✅ Quiz Score: Tabela $table_name atualizada com sucesso");
            } else {
                error_log("❌ Quiz Score: Erro ao criar tabela $table_name");
                error_log("Último erro MySQL: " . $wpdb->last_error);
            }
            
        } catch (Exception $e) {
            error_log("❌ Quiz Score: Exceção ao criar tabela - " . $e->getMessage());
        }
    }

    public function save_quiz_settings() {
        // Verifica o nonce
        if (!check_ajax_referer('wpforms-quiz', 'nonce', false)) {
            wp_send_json_error(array(
                'message' => 'Nonce inválido. Por favor, recarregue a página e tente novamente.'
            ));
            return;
        }

        $form_id = isset($_POST['form_id']) ? absint($_POST['form_id']) : 0;
        $settings = isset($_POST['settings']) ? $_POST['settings'] : array();

        if (!$form_id || empty($settings)) {
            wp_send_json_error(array('message' => 'Dados inválidos'));
            return;
        }

        global $wpdb;
        $success = true;
        $errors = array();

        foreach ($settings as $key => $data) {
            $result = $wpdb->replace(
                $wpdb->prefix . 'wpforms_quiz_answers',
                array(
                    'form_id' => $form_id,
                    'field_id' => absint($data['field_id']),
                    'correct_answer' => sanitize_text_field($data['answer']),
                    'answer_type' => 'quiz'
                ),
                array('%d', '%d', '%s', '%s')
            );

            if ($result === false) {
                $success = false;
                $errors[] = "Erro ao salvar resposta para o campo {$data['field_id']}";
            }
        }

        if ($success) {
            wp_send_json_success(array('message' => 'Configurações salvas com sucesso'));
        } else {
            wp_send_json_error(array('message' => implode(', ', $errors)));
        }
    }

    private function add_settings_script() {
        error_log('🎯 décimo add_settings_script');
        ?>
        <script type="text/javascript">
        jQuery(document).ready(function($) {
            $('#save-quiz-settings').on('click', function(e) {
                e.preventDefault();
                console.log('🎯 Iniciando salvamento...');
                
                // Coleta as respostas
                var settings = {};
                $('.quiz-question-settings select').each(function() {
                    var $select = $(this);
                    var form_id = $select.data('form-id');
                    var field_id = $select.data('field-id');
                    var answer = $select.val();
                    
                    if (answer && answer !== '') {
                        // Estrutura correta dos dados
                        var key = 'quiz_correct_answer_' + form_id + '_' + field_id;
                        settings[key] = {
                            form_id: form_id,
                            field_id: field_id,
                            answer: answer
                        };
                        
                        console.log('Resposta coletada:', {
                            form_id: form_id,
                            field_id: field_id,
                            answer: answer
                        });
                    }
                });
                
                // Debug
                console.log('Dados a serem enviados:', settings);
                
                // Se não houver respostas selecionadas
                if (Object.keys(settings).length === 0) {
                    alert('Por favor, selecione pelo menos uma resposta correta.');
                    return;
                }
                
                // Mostra loading
                var $button = $(this);
                var $spinner = $button.next('.spinner');
                $button.prop('disabled', true);
                $spinner.css('visibility', 'visible');
                
                // Envia para o servidor
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'save_quiz_settings',
                        nonce: '<?php echo wp_create_nonce("wpforms-builder"); ?>',
                        settings: settings
                    },
                    success: function(response) {
                        console.log('Resposta:', response);
                        if (response.success) {
                            alert('✅ ' + response.data.message);
                        } else {
                            alert('❌ ' + response.data.message);
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Erro:', error);
                        alert('Erro ao salvar configurações');
                    },
                    complete: function() {
                        $button.prop('disabled', false);
                        $spinner.css('visibility', 'hidden');
                    }
                });
            });
        });
        </script>
        <?php
    }

    public function get_form_data() {
        error_log('🎯 décimo primeiro get_form_data');
        global $wpdb;
        
        $current_form_id = isset($_GET['form_id']) ? absint($_GET['form_id']) : 0;
        
        if (!$current_form_id) {
            error_log('Form ID não encontrado');
            return array();
        }
        
        error_log('Buscando respostas para o formulário: ' . $current_form_id);
        
        $answers = $wpdb->get_results($wpdb->prepare(
            "SELECT field_id, correct_answer 
            FROM {$this->table_name} 
            WHERE form_id = %d",
            $current_form_id
        ));
        
        $form_data = array();
        
        foreach ($answers as $answer) {
            $form_data[$answer->field_id] = $answer->correct_answer;
            error_log("Resposta carregada - Field ID: {$answer->field_id}, Valor: {$answer->correct_answer}");
        }
        
        error_log('Dados do formulário recuperados: ' . print_r($form_data, true));
        return $form_data;
    }

    public function get_quiz_answers() {
        error_log('🎯 Iniciando busca de respostas');
        
        // Verifica o nonce
        if (!check_ajax_referer('wpforms-quiz', 'nonce', false)) {
            error_log('❌ Nonce inválido');
            wp_send_json_error(array('message' => 'Erro de segurança'));
            return;
        }

        global $wpdb;
        
        $form_id = isset($_POST['form_id']) ? absint($_POST['form_id']) : 0;
        
        error_log('🔍 Buscando respostas para o form_id: ' . $form_id);
        
        if (!$form_id) {
            error_log('❌ Form ID inválido');
            wp_send_json_error(array('message' => 'Form ID inválido'));
            return;
        }

        // Busca todas as respostas corretas para o formulário
        $respostas = $wpdb->get_results($wpdb->prepare(
            "SELECT field_id, correct_answer, answer_type 
            FROM {$this->table_name} 
            WHERE form_id = %d",
            $form_id
        ));

        if ($respostas === false) {
            error_log('❌ Erro no banco de dados: ' . $wpdb->last_error);
            wp_send_json_error(array('message' => 'Erro ao buscar respostas'));
            return;
        }

        // Formata as respostas para enviar ao JavaScript
        $respostas_formatadas = array();
        foreach ($respostas as $resposta) {
            $respostas_formatadas[$resposta->field_id] = array(
                'answer' => $resposta->correct_answer,
                'type' => $resposta->answer_type
            );
        }

        error_log('✅ Respostas encontradas: ' . print_r($respostas_formatadas, true));
        
        wp_send_json_success($respostas_formatadas);
    }

    // Adiciona a opção de cálculo no builder
    public function add_calculate_field_settings($options) {
        error_log('🎯 décimo terceiro add_calculate_field_settings');
        $options['calculate'] = array(
            'id'      => 'calculate',
            'name'    => 'calculate',
            'type'    => 'checkbox',
            'label'   => 'Campo de Cálculo',
            'tooltip' => 'Quando ativado, este campo mostrará automaticamente a nota final do quiz.',
            'class'   => 'wpforms-field-option-row-calculate'
        );
        
        return $options;
    }

    // Modifica o campo quando a opção de cálculo está ativada
    public function add_calculate_field_option($properties, $field) {
        if (!empty($field['calculate'])) {
            $properties['container']['class'][] = 'wpforms-field-hidden';
            $properties['inputs']['primary']['data']['calc-field'] = '1';
            $properties['inputs']['primary']['attr']['readonly'] = 'readonly';
            $properties['inputs']['primary']['class'][] = 'wpforms-calc-field';
        }
        return $properties;
    }

    // Adiciona o filtro para substituir a variável {quiz_score}
    public function process_smart_tags($content, $form_data, $fields = array(), $entry_id = 0) {
        if (strpos($content, '{quiz_score}') !== false) {
            $content = str_replace('{quiz_score}', '<span class="quiz-score-display">0</span>', $content);
        }
        return $content;
    }

    public function add_score_settings($instance) {
        error_log('🎯 décimo quarto add_score_settings');
        global $wpdb;
        
        echo '<div class="wpforms-panel-content-section wpforms-panel-content-section-quiz_score">';
        echo '<div class="wpforms-panel-content-section-title">';
        echo 'Opções de Pontuação';
        echo '</div>';
        
        // Busca o formulário atual
        $form_id = absint($_GET['form_id']);
        if (!$form_id) {
            echo '<p>Formulário não encontrado.</p>';
            echo '</div>';
            return;
        }
        
        // Busca os campos do formulário
        $form = wpforms()->form->get($form_id);
        if (empty($form)) {
            echo '<p>Formulário não encontrado.</p>';
            echo '</div>';
            return;
        }
        
        $form_data = json_decode($form->post_content, true);
        $number_fields = array();
        
        // Filtra apenas campos do tipo number
        if (!empty($form_data['fields'])) {
            foreach ($form_data['fields'] as $field) {
                if ($field['type'] === 'number') {
                    $number_fields[$field['id']] = array(
                        'label' => $field['label'],
                        'id' => $field['id']
                    );
                }
            }
        }
        
        // Busca a configuração atual
        $current_score_field = isset($form_data['settings']['quiz_score_field']) ? 
                              $form_data['settings']['quiz_score_field'] : '';
        
        // Campo para selecionar onde mostrar a pontuação
        echo '<div class="wpforms-setting-row">';
        echo '<label class="wpforms-setting-label">Campo para Exibir Pontuação</label>';
        echo '<div class="wpforms-setting-field">';
        
        if (empty($number_fields)) {
            echo '<p class="description" style="color: #cc0000;">Nenhum campo numérico encontrado. Adicione um campo do tipo "Número" ao formulário.</p>';
        } else {
            echo '<div class="score-field-selection" style="display: flex; align-items: center; gap: 10px;">';
            echo '<select name="quiz_score_field" id="quiz_score_field" data-form-id="' . esc_attr($form_id) . '">';
            echo '<option value="">Selecione um campo</option>';
            
            foreach ($number_fields as $field) {
                $selected = ($current_score_field == $field['id']) ? 'selected' : '';
                echo sprintf(
                    '<option value="%d" %s>%s (ID: %d)</option>',
                    $field['id'],
                    $selected,
                    esc_html($field['label']),
                    $field['id']
                );
            }
            echo '</select>';
            
            echo '<button type="button" id="save-score-field" class="wpforms-btn wpforms-btn-md wpforms-btn-blue">
                    <span class="dashicons dashicons-saved" style="margin-right: 5px;"></span>
                    Salvar Campo
                  </button>';
            echo '<span class="spinner" style="float: none; margin: 0 5px;"></span>';
            echo '</div>';
            
            echo '<div style="margin-top: 10px;">';
            echo '<label style="display: flex; align-items: center; gap: 5px;">';
            echo '<input type="checkbox" name="hide_score_field" id="hide_score_field">';
            echo '<span>Ocultar este campo após preenchimento</span>';
            echo '</label>';
            echo '</div>';
            
            echo '<p class="description">Selecione o campo numérico onde a pontuação será exibida automaticamente.</p>';
        }
        
        echo '</div>';
        echo '</div>';
        
        // Informações do shortcode
        echo '<div class="wpforms-setting-row">';
        echo '<label class="wpforms-setting-label">Shortcode da Pontuação</label>';
        echo '<div class="wpforms-setting-field">';
        echo '<div class="shortcode-container" style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 10px 0;">';
        echo '<p style="margin:0 0 10px 0;"><strong>Shortcode básico:</strong></p>';
        echo '<code style="display:block;padding:8px;background:#fff;border:1px solid #ddd;border-radius:3px">[wpforms_quiz_score form_id="' . $form_id . '"]</code>';
        echo '<p style="margin:10px 0 0 0;font-size:13px;color:#666;">💡 Copie e cole este shortcode em qualquer página ou post para exibir a pontuação do quiz.</p>';
        echo '</div>';
        echo '<div class="shortcode-examples" style="margin-top:15px;">';
        echo '<p style="margin:0 0 8px 0;"><strong>Exemplos de uso:</strong></p>';
        echo '<ul style="margin:0;padding-left:20px;color:#666;font-size:13px;">';
        echo '<li>Em posts: Cole o shortcode no editor</li>'; 
        echo '<li>Aqui no formulário: Selecione um elemento HTML e adicione: <code style="background:#f1f1f1;padding:2px 4px;">[wpforms_quiz_score form_id="' . $form_id . '"]</code></li>';
        echo '</ul>';
        echo '</div>';
        echo '</div>';
        echo '</div>';
        
        echo '</div>';
    }

    public function score_shortcode($atts) {
        error_log('🎯 décimo quinto score_shortcode');
        $atts = shortcode_atts(array(
            'form_id' => 0
        ), $atts);
        
        if (empty($atts['form_id'])) {
            return '';
        }
        
        // Retorna um span que será atualizado via JavaScript
        return sprintf(
            '<span class="quiz-score-display" data-form-id="%d">0.0</span>',
            (int)$atts['form_id']
        );
    }

    public function save_quiz_score_field() {
        error_log('🎯 Iniciando save_quiz_score_field');
        
        // Verifica o nonce
        if (!check_ajax_referer('wpforms-quiz', 'nonce', false)) {
            error_log('❌ Nonce inválido');
            wp_send_json_error(array('message' => 'Erro de segurança'));
            return;
        }

        global $wpdb;
        
        $form_id = isset($_POST['form_id']) ? absint($_POST['form_id']) : 0;
        $field_id = isset($_POST['field_id']) ? absint($_POST['field_id']) : 0;
        
        error_log(sprintf('📝 Dados recebidos - Form ID: %d, Field ID: %d', $form_id, $field_id));
        
        if (!$form_id || !$field_id) {
            error_log('❌ IDs inválidos');
            wp_send_json_error(array('message' => 'Dados inválidos'));
            return;
        }

        // Verifica se já existe um campo de pontuação
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$this->table_name} 
            WHERE form_id = %d AND answer_type = 'score_field'",
            $form_id
        ));

        if ($existing) {
            // Atualiza o registro existente
            $result = $wpdb->update(
                $this->table_name,
                array(
                    'field_id' => $field_id,
                    'answer_type' => 'score_field',
                    'correct_answer' => '',
                    'updated_at' => current_time('mysql')
                ),
                array(
                    'form_id' => $form_id,
                    'answer_type' => 'score_field'
                ),
                array('%d', '%s', '%s', '%s'),
                array('%d', '%s')
            );
        } else {
            // Insere novo registro
            $result = $wpdb->insert(
                $this->table_name,
                array(
                    'form_id' => $form_id,
                    'field_id' => $field_id,
                    'answer_type' => 'score_field',
                    'correct_answer' => '',
                    'created_at' => current_time('mysql'),
                    'updated_at' => current_time('mysql')
                ),
                array('%d', '%d', '%s', '%s', '%s', '%s')
            );
        }

        if ($result === false) {
            error_log('❌ Erro ao salvar: ' . $wpdb->last_error);
            wp_send_json_error(array('message' => 'Erro ao salvar campo'));
            return;
        }

        error_log('✅ Campo salvo com sucesso');
        wp_send_json_success(array(
            'message' => 'Campo salvo com sucesso',
            'field_id' => $field_id
        ));
    }
}

// Instancia a classe fora
$wpforms_quiz = new WPForms_Quiz_Score();

// Registra o hook de ativação separadamente
register_activation_hook(__FILE__, array($wpforms_quiz, 'create_answers_table')); 